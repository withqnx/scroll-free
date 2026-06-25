#!/usr/bin/env node
// figma-pull.mjs — Figma 캔버스에서 이미지 레이어를 읽어 원본을 내려받고 manifest.json을 만든다.
//
// 사용:
//   FIGMA_TOKEN=... node scripts/figma-pull.mjs
//   node scripts/figma-pull.mjs --dataset="꽃셔츠"        # 프레임 이름 부분일치 필터
//   node scripts/figma-pull.mjs --cropped                  # 크롭 레이어는 렌더본(.cropped.png)도 병행 저장
//   node scripts/figma-pull.mjs --force                    # 이미 받은 파일도 다시 받기
//   node scripts/figma-pull.mjs --canvas=312:2             # 캔버스 노드 지정
//
// Node 18+ (내장 fetch / fs 사용, 외부 의존성 없음).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── 설정 ────────────────────────────────────────────────
const FILE_KEY = 'B1zF1SNcDmjm107N5xz4xg';
const DEFAULT_CANVAS = '312:2';
const API = 'https://api.figma.com/v1';

// ── 인자 파싱 ───────────────────────────────────────────
const args = process.argv.slice(2);
const getFlag = (k) => args.includes(`--${k}`);
const getOpt = (k, def) => {
  const hit = args.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : def;
};
const DATASET_FILTER = getOpt('dataset', null); // 콤마로 여러 개 부분일치 가능: --dataset="세종,틈"
const DATASET_TERMS = DATASET_FILTER ? DATASET_FILTER.split(',').map((s) => s.trim()).filter(Boolean) : null;
const matchesFilter = (name) => !DATASET_TERMS || DATASET_TERMS.some((t) => name.includes(t));
const CANVAS_ID = getOpt('canvas', DEFAULT_CANVAS);
const WITH_CROPPED = getFlag('cropped');
const FORCE = getFlag('force');

// ── 토큰 로드 (.env 또는 환경변수) ──────────────────────
function loadToken() {
  if (process.env.FIGMA_TOKEN) return process.env.FIGMA_TOKEN.trim();
  const envPath = path.join(ROOT, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*FIGMA_TOKEN\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, '').trim();
    }
  }
  console.error('✗ FIGMA_TOKEN 없음. .env 에 FIGMA_TOKEN=... 를 넣거나 환경변수로 전달하세요.');
  process.exit(1);
}
const TOKEN = loadToken();
const headers = { 'X-Figma-Token': TOKEN };

// ── 유틸 ────────────────────────────────────────────────
async function api(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Figma API ${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

// 파일명 슬러그: 공백→-, 파일시스템 위험문자 제거. 한글은 보존.
function slugify(name) {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')   // 파일시스템 금지문자
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

// ── 트리에서 이미지/텍스트 레이어 수집 ─────────────────
// 각 데이터셋(= 캔버스 직속 FRAME) 단위로 leaf 슬롯을 모은다.
function imageRefOf(node) {
  for (const f of node.fills || []) {
    if (f.type === 'IMAGE' && f.visible !== false) return f.imageRef;
  }
  return null;
}

function collectSlots(node, ancestorsFrames, out, order) {
  const bb = node.absoluteBoundingBox;
  const imgRef = imageRefOf(node);

  if (imgRef && bb) {
    // 가장 가까운 (캔버스가 아닌) 조상 FRAME = 크롭 프레임 후보
    const parentFrame = ancestorsFrames[ancestorsFrames.length - 1] || null;
    let crop = null;
    if (parentFrame && parentFrame.absoluteBoundingBox) {
      const fb = parentFrame.absoluteBoundingBox;
      const cropped = fb.width < bb.width - 1 || fb.height < bb.height - 1;
      if (cropped) {
        crop = {
          frameW: Math.round(fb.width),
          frameH: Math.round(fb.height),
          imgW: Math.round(bb.width),
          imgH: Math.round(bb.height),
          offsetX: Math.round(bb.x - fb.x),
          offsetY: Math.round(bb.y - fb.y),
        };
      }
    }
    out.push({
      name: node.name,
      slug: slugify(node.name),
      type: 'image',
      nodeId: node.id,
      imageRef: imgRef,
      width: Math.round(bb.width),
      height: Math.round(bb.height),
      frame: parentFrame ? { name: parentFrame.name, nodeId: parentFrame.id } : null,
      crop,
      order: order.n++,
    });
    return; // 이미지 leaf는 더 내려가지 않음
  }

  if (node.type === 'TEXT') {
    out.push({
      name: node.name,
      slug: slugify(node.name),
      type: 'text',
      nodeId: node.id,
      characters: node.characters || null,
      order: order.n++,
    });
    return;
  }

  const nextAncestors =
    node.type === 'FRAME' ? [...ancestorsFrames, node] : ancestorsFrames;
  for (const child of node.children || []) {
    collectSlots(child, nextAncestors, out, order);
  }
}

// ── 다운로드 ────────────────────────────────────────────
async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status} — ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

// ── 메인 ────────────────────────────────────────────────
async function main() {
  console.log(`▶ 캔버스 ${CANVAS_ID} 트리 로딩…`);
  const tree = await api(
    `${API}/files/${FILE_KEY}/nodes?ids=${encodeURIComponent(CANVAS_ID)}&depth=6`
  );
  const canvas = tree.nodes[CANVAS_ID]?.document;
  if (!canvas) throw new Error(`캔버스 노드 ${CANVAS_ID} 를 찾을 수 없습니다.`);

  // 데이터셋 단위 묶기: 캔버스 직속 FRAME = 데이터셋. 그 외 직속 leaf = "_loose".
  const datasets = [];
  const looseSlots = [];
  for (const child of canvas.children || []) {
    if (child.type === 'FRAME') {
      if (!matchesFilter(child.name)) continue;
      const slots = [];
      collectSlots(child, [], slots, { n: 0 });
      datasets.push({ name: child.name, slug: slugify(child.name), nodeId: child.id, slots });
    } else {
      if (DATASET_TERMS) continue;
      collectSlots(child, [], looseSlots, { n: looseSlots.length });
    }
  }
  if (looseSlots.length) {
    datasets.push({ name: '_loose', slug: '_loose', nodeId: CANVAS_ID, slots: looseSlots });
  }

  const allImages = datasets.flatMap((d) => d.slots.filter((s) => s.type === 'image'));
  console.log(
    `  데이터셋 ${datasets.length}개 · 이미지 ${allImages.length}장 · ` +
      `텍스트 ${datasets.flatMap((d) => d.slots).filter((s) => s.type === 'text').length}개`
  );

  // imageRef → S3 원본 URL 맵 (1회 조회)
  console.log('▶ 원본 이미지 URL 맵 조회…');
  const imgMap = (await api(`${API}/files/${FILE_KEY}/images`)).meta.images;

  // 크롭 렌더본(선택) — nodeId → 렌더 URL
  let croppedMap = {};
  if (WITH_CROPPED) {
    const croppedIds = allImages.filter((s) => s.crop).map((s) => s.nodeId);
    if (croppedIds.length) {
      console.log(`▶ 크롭 렌더본 ${croppedIds.length}장 요청 (scale=2)…`);
      const r = await api(
        `${API}/images/${FILE_KEY}?ids=${croppedIds.map(encodeURIComponent).join(',')}&scale=2&format=png`
      );
      croppedMap = r.images || {};
    }
  }

  // 다운로드
  const assetsRoot = path.join(ROOT, 'assets');
  let downloaded = 0,
    skipped = 0,
    failed = 0;

  for (const ds of datasets) {
    const dsDir = path.join(assetsRoot, ds.slug);
    for (const slot of ds.slots) {
      if (slot.type !== 'image') continue;
      const rel = path.join('assets', ds.slug, `${slot.slug}.png`);
      slot.file = rel.split(path.sep).join('/');
      const dest = path.join(ROOT, rel);

      if (!FORCE && fs.existsSync(dest)) {
        skipped++;
      } else {
        const url = imgMap[slot.imageRef];
        if (!url) {
          console.warn(`  ⚠ imageRef 누락: ${slot.name}`);
          failed++;
          continue;
        }
        ensureDir(dsDir);
        try {
          const bytes = await download(url, dest);
          downloaded++;
          process.stdout.write(`  ↓ ${ds.slug}/${slot.slug}.png (${(bytes / 1e6).toFixed(1)}MB)\n`);
        } catch (e) {
          console.warn(`  ✗ ${slot.name}: ${e.message}`);
          failed++;
          continue;
        }
      }

      // 크롭 렌더본
      if (WITH_CROPPED && slot.crop && croppedMap[slot.nodeId]) {
        const relC = path.join('assets', ds.slug, `${slot.slug}.cropped.png`);
        const destC = path.join(ROOT, relC);
        if (FORCE || !fs.existsSync(destC)) {
          try {
            await download(croppedMap[slot.nodeId], destC);
            slot.croppedFile = relC.split(path.sep).join('/');
          } catch (e) {
            console.warn(`  ✗ crop ${slot.name}: ${e.message}`);
          }
        } else {
          slot.croppedFile = relC.split(path.sep).join('/');
        }
      }
    }
  }

  // manifest 작성
  const manifest = {
    fileKey: FILE_KEY,
    canvas: CANVAS_ID,
    generatedAt: new Date().toISOString(),
    datasets: datasets.map((d) => ({
      name: d.name,
      slug: d.slug,
      nodeId: d.nodeId,
      slots: d.slots,
    })),
  };
  fs.writeFileSync(path.join(ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(
    `\n✓ 완료 — 다운로드 ${downloaded} · 스킵 ${skipped} · 실패 ${failed}\n` +
      `  manifest.json (${datasets.length} datasets) 작성됨.`
  );
}

main().catch((e) => {
  console.error('\n✗ 오류:', e.message);
  process.exit(1);
});
