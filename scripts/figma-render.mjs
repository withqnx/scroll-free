#!/usr/bin/env node
// figma-render.mjs — 특정 노드들을 Figma 서버에서 렌더링(크롭/마스크 반영)해 내려받는다.
// 원본 imageRef가 아니라 "보이는 그대로"가 필요할 때(크롭·마스크·합성) 사용.
//
// 사용: node scripts/figma-render.mjs --job=path/to/job.json [--force]
// job.json = { "scale":0.4, "format":"png", "out":"assets/foo", "items":[ {"id":"1:2","name":"md-01"}, ... ] }

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FILE_KEY = 'B1zF1SNcDmjm107N5xz4xg';
const API = 'https://api.figma.com/v1';

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const jobPath = (args.find((a) => a.startsWith('--job=')) || '').slice(6);
if (!jobPath) { console.error('✗ --job=<path> 필요'); process.exit(1); }

function loadToken() {
  if (process.env.FIGMA_TOKEN) return process.env.FIGMA_TOKEN.trim();
  const p = path.join(ROOT, '.env');
  if (fs.existsSync(p))
    for (const l of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = l.match(/^\s*FIGMA_TOKEN\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, '').trim();
    }
  console.error('✗ FIGMA_TOKEN 없음'); process.exit(1);
}
const headers = { 'X-Figma-Token': loadToken() };

async function api(url) {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`API ${r.status} ${url}`);
  return r.json();
}
async function download(url, dest) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`dl ${r.status}`);
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
}

const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function main() {
  const job = JSON.parse(fs.readFileSync(path.resolve(ROOT, jobPath), 'utf8'));
  const scale = job.scale || 1;
  const format = job.format || 'png';
  const outDir = path.resolve(ROOT, job.out);
  fs.mkdirSync(outDir, { recursive: true });

  const todo = job.items.filter((it) => FORCE || !fs.existsSync(path.join(outDir, `${it.name}.${format}`)));
  if (!todo.length) { console.log('  (모두 존재 — 스킵)'); return; }

  let done = 0;
  for (const group of chunk(todo, 6)) {
    const ids = group.map((it) => it.id);
    const res = await api(
      `${API}/images/${FILE_KEY}?ids=${ids.map(encodeURIComponent).join(',')}&scale=${scale}&format=${format}`
    );
    for (const it of group) {
      const url = res.images[it.id];
      if (!url) { console.warn(`  ⚠ 렌더 URL 없음: ${it.name} (${it.id})`); continue; }
      await download(url, path.join(outDir, `${it.name}.${format}`));
      done++;
      process.stdout.write(`  ↓ ${job.out}/${it.name}.${format}\n`);
    }
  }
  console.log(`✓ ${done}장 렌더 완료 → ${job.out}`);
}
main().catch((e) => { console.error('✗', e.message); process.exit(1); });
