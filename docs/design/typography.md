# 타이포그래피 시스템

스크립트별로 폰트를 분리한다 — **라틴(영문)**과 **숫자·한글**에 다른 글꼴/두께를 적용.

## 스펙

| 용도 | 폰트 | 두께 | family 스택 |
|---|---|---|---|
| **영문 (라틴)** | **Plain** | **400** | `Plain, Arial, sans-serif` |
| **숫자 & 한글** | **MD Sans** | **480** | `"MD Sans", system-ui, -apple-system, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif` |

- style: normal (둘 다)
- `Plain` = Optimo Plain (상용), `MD Sans` = 상용 한글. **웹폰트 파일(woff2) 직접 호스팅 필요** (무료 CDN 없음).
- 두께 480은 가변폰트(variable) 값 — MD Sans variable 또는 480 웨이트 파일 사용.

## 구현 (실제 빌드)

스크립트 분리는 `@font-face` + `unicode-range`로 처리한다. 라틴 글자는 Plain, **숫자(U+0030–0039)와 한글은 MD Sans**가 맡도록 Plain의 범위에서 숫자를 제외한다.

```css
/* 라틴 글자만 (숫자 제외) → Plain 400 */
@font-face {
  font-family: "Plain";
  src: url("/fonts/Plain-Regular.woff2") format("woff2");
  unicode-range: U+0041-005A, U+0061-007A, U+00C0-00FF, U+0100-024F;
  font-weight: 400; font-style: normal; font-display: swap;
}
/* 숫자 + 한글 → MD Sans 480 */
@font-face {
  font-family: "MD Sans";
  src: url("/fonts/MDSans.woff2") format("woff2");
  unicode-range: U+0030-0039, U+AC00-D7A3, U+1100-11FF, U+3130-318F, U+A960-A97F;
  font-weight: 480; font-style: normal; font-display: swap;
}

:root {
  --font-sans:
    "Plain", "MD Sans", system-ui, -apple-system, "Segoe UI", Roboto,
    Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
}
body { font-family: var(--font-sans); font-weight: 480; letter-spacing: -0.03em; }
```

- **자간(letter-spacing): -3% (-0.03em)** 기본 적용. 단, 대문자 소형 라벨(요일 등 의도적으로 양수 트래킹한 것)은 예외로 유지.
- 브라우저가 글자별 unicode-range로 폰트를 자동 선택 → 영문은 Plain 400, 숫자·한글은 MD Sans 480.
- 라틴 기본 두께 400, 숫자·한글 480이 자연스럽게 적용됨(각 @font-face가 자기 두께를 표현).
- 숫자 정렬이 필요한 곳(캘린더 날짜·기간)은 `font-variant-numeric: tabular-nums` 병행.

## 메모

- **Plain·MD Sans는 상용 폰트**(Optimo / 상용 한글) — 무료 CDN 없음. 라이선스 woff2를 `public/fonts/`에 호스팅해야 정식 적용.
- 목업(docs/design/mockups)은 라이선스 부담 없는 **무료 대체로 미리보기**: 영문 **Inter**(Google Fonts) + 숫자·한글 **Pretendard**. Plain이 로컬 설치돼 있으면 `local()`로 우선 사용. 실제 빌드 스펙은 위(Plain/MD Sans) 그대로 유지.
- Tailwind 적용 시 `theme.fontFamily.sans`에 위 스택, 기본 weight 480으로 설정.
