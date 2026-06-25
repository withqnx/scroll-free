# 스압 해결 방법 — 웹 인터랙션 상세페이지

긴 JPG 상세페이지의 "스크롤 압박"을 웹 인터랙션으로 푸는 5가지 템플릿 모음 (발표용).

**라이브:** https://withqnx.github.io/scroll-free/

## 구성
| | 템플릿 | 인터랙션 | 소스 (Figma) |
|---|---|---|---|
| 1-1 | 적은 옵션 | 컬러칩 호버/클릭 → 메인 이미지 교체 | DATA - 세종 |
| 1-2 | 제조 과정 | 8단계 스테퍼 호버/클릭 → 일러스트 교체 | DATA - 틈 클래식 |
| 2 | 소재 | 겹친 패널 아코디언 → 확대 + 설명 노출 | DATA - 꽃셔츠 소재 |
| 3 | 오프닝 | 폴라로이드 애니메이션 + 가로 스와이프 | DATA - 발옷 시즌2 |
| 4 | 많은 옵션 | 20칸 바둑판 → 모델이 다가오는 줌 전환 | DATA - 꽃셔츠 옵션 |

순수 HTML/CSS/JS. 빌드 과정 없음 — 정적 파일 그대로 서빙.

## 이미지 다시 받기 (Figma)
```bash
cp .env.example .env          # FIGMA_TOKEN 채우기
node scripts/figma-pull.mjs --dataset="세종,틈"      # 원본 다운로드
node scripts/figma-render.mjs --job=scripts/jobs/sojae.json   # 렌더링(크롭/마스크 반영)
```
- `figma-pull.mjs` — imageRef 원본을 그대로 다운로드 (`/v1/files/{key}/images`)
- `figma-render.mjs` — 노드를 렌더링해 크롭·마스크·웹 최적화 크기로 다운로드 (`scripts/jobs/*.json`)

## 로컬 미리보기
```bash
python3 -m http.server 8000   # → http://localhost:8000
```
