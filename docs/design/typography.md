# 타이포그래피 시스템

스크립트별로 폰트를 분리한다 — **라틴(영문)**과 **숫자·한글**에 다른 글꼴/두께를 적용.

## 스펙

| 용도 | 폰트 | 두께 | family 스택 |
|---|---|---|---|
| **영문 (라틴)** | **Plain** (상용) | **400** | `Plain, "IBM Plex Sans KR", sans-serif` |
| **숫자 & 한글** | **IBM Plex Sans KR** (무료/OFL) | **400~500** | `"IBM Plex Sans KR", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif` |

- style: normal (둘 다)
- `Plain` = Optimo Plain (상용, woff2 호스팅 필요). `IBM Plex Sans KR` = **무료(OFL)** — Google Fonts에서 바로 로드 (`family=IBM+Plex+Sans+KR`).
- IBM Plex Sans KR은 가변폰트가 아니라 단계 웨이트(400/500/600/700). 기존 480 의도는 400 또는 500으로 매핑.
- (선택) 영문도 무료로 가려면 Plain 대신 `IBM Plex Sans`를 쓰면 전부 무료로 통일 가능.

## 구현 (실제 빌드)

스크립트 분리는 `@font-face` + `unicode-range`로 처리한다. 라틴 글자는 Plain, **숫자(U+0030–0039)와 한글은 IBM Plex Sans KR**이 맡도록 Plain의 범위에서 숫자를 제외한다.

```css
/* 숫자·한글 = IBM Plex Sans KR (무료) — Google Fonts 로드 */
@import url("https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap");

/* 라틴 글자만 (숫자 제외) → Plain 400. 숫자는 위 IBM Plex가 맡도록 범위에서 제외 */
@font-face {
  font-family: "Plain";
  src: url("/fonts/Plain-Regular.woff2") format("woff2");
  unicode-range: U+0041-005A, U+0061-007A, U+00C0-00FF, U+0100-024F;
  font-weight: 400; font-style: normal; font-display: swap;
}

:root {
  /* Plain(라틴 글자) → IBM Plex Sans KR(숫자·한글, 그리고 Plain 미보유 시 라틴 대체) */
  --font-sans: "Plain", "IBM Plex Sans KR", system-ui, -apple-system,
    "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
}
body { font-family: var(--font-sans); font-weight: 480; letter-spacing: -0.03em; }
```

- **자간(letter-spacing): -3% (-0.03em)** 기본 적용. 단, 대문자 소형 라벨(요일 등 의도적으로 양수 트래킹한 것)은 예외로 유지.
- 글자별 폰트 선택: 라틴 글자 → Plain, **숫자·한글 → IBM Plex Sans KR**(Plain 범위에서 숫자 제외).
- 두께: IBM Plex Sans KR은 단계 웨이트라 480 → 400/500으로 매핑(원하면 명시 지정).
- 숫자 정렬이 필요한 곳(캘린더 날짜·기간)은 `font-variant-numeric: tabular-nums` 병행.

## 메모

- **숫자·한글 = IBM Plex Sans KR (무료/OFL)** — Google Fonts에서 바로 로드, 별도 호스팅 불필요.
- **영문 = Plain (상용)** — woff2를 `public/fonts/`에 호스팅해야 정식 적용. 미보유 시 IBM Plex Sans(라틴)로 대체됨. 전부 무료로 통일하려면 영문도 `IBM Plex Sans`로 교체 가능.
- 목업(docs/design/mockups)도 동일 스택 사용(IBM Plex Sans KR 로드, Plain은 설치 시 local 우선).
- Tailwind 적용 시 `theme.fontFamily.sans`에 위 스택.
