# 스압 해결 방법 — 웹 인터랙션 상세페이지

긴 JPG 상세페이지의 "스크롤 압박"을 웹 인터랙션으로 푸는 템플릿 모음 (발표용).

**라이브:** https://withqnx.github.io/scroll-free/

## 구조 — 템플릿 + 데이터
```
index.html              홈 (템플릿/내용 안내 + 각 템플릿 링크)
templates/              제네릭 인터랙션 템플릿 (디자인·동작만, 데이터 없음)
  picker.html           컬러칩 → 메인 교체
  stepper.html          단계 스테퍼 → 이미지 교체
  accordion.html        겹친 패널 → 확대 + 설명
  opening.html          가로 스와이프 (피그마 컷 그대로)
  gallery.html          바둑판 썸네일 → 모델 줌
data/                   각 상세의 데이터(내용 + 프레임 비율) JSON
  세종.json  틈.json  꽃셔츠-소재.json  발옷.json  꽃셔츠-옵션.json
lib/load-config.js      ?d=<이름> 으로 data/<이름>.json 을 불러와 템플릿에 주입
assets/                 Figma에서 내려받은 이미지 (레이어 이름 그대로)
scripts/                Figma 이미지 추출 스크립트
```

각 템플릿은 `?d=<데이터이름>` 으로 연다. 예) `templates/gallery.html?d=꽃셔츠-옵션`

## 새 상세 만들기 (데이터·비율만 바꾸면 끝)
1. **이미지 받기** — 레이어 이름을 매핑해 Figma에서 추출
   ```bash
   node scripts/figma-pull.mjs --dataset="<프레임이름>"        # 원본 그대로
   node scripts/figma-render.mjs --job=scripts/jobs/<job>.json  # 크롭/마스크 반영·웹 최적화
   ```
2. **데이터 JSON 추가** — `data/<새이름>.json` 작성. `template` 으로 어떤 템플릿을 쓸지 지정하고, 항목·텍스트·`assetBase`·프레임 비율(`aspect`, `cols`/`rows`, `modelObjectPosition` 등)만 채운다.
3. **열기** — `templates/<템플릿>.html?d=<새이름>`. (홈에 카드 한 줄 추가하면 버튼으로 노출)

> 코드는 손대지 않는다. **데이터와 비율만** JSON에서 바꾸면 새 상세가 바로 나온다.

### 데이터 JSON 예시 (gallery)
```jsonc
{
  "template": "gallery",
  "count": 20, "cols": 4, "rows": 5,           // 프레임 비율(바둑판 칸 수)
  "modelBase": "../assets/옵션/models/", "patternBase": "../assets/옵션/patterns/",
  "modelObjectPosition": "center 16%",          // 모델샷 크롭 위치
  "patternObjectPositionByIndex": { "17": "left center" }  // 특정 썸네일 크롭 보정
}
```

## 로컬 미리보기
```bash
python3 -m http.server 8000   # → http://localhost:8000
```
