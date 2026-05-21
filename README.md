# 먼슬리 캘린더 (Monthly Calendar)

드래그로 기간 할일을 등록하고 막대로 표시하는 무한 스크롤 먼슬리 캘린더.
로컬 전용(IndexedDB), 서버/로그인 없음.

- **스택:** Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Dexie · Vitest
- **디자인:** 스위스 모노크롬 + 하이라인. 색은 할일 막대에만 (`docs/design/`).
- **정본 문서:** `tasks/prd-monthly-calendar.md` · 색상 `docs/design/color-system.md` · 타이포 `docs/design/typography.md` · 시각 레퍼런스 `docs/design/mockups/calendar-layouts.html` (F 탭)

## 폴더 구조

```
app/          # Next.js App Router 페이지
components/   # 캘린더, 막대, 사이드 패널 등 UI
lib/db/       # Dexie 스키마 및 데이터 접근
lib/calendar/ # 날짜 계산, 막대 레이아웃(레인) 로직
lib/color/    # 색조+톤 합성, 텍스트 대비 계산
```

## 개발

```bash
npm run dev        # 개발 서버
npm run build      # 프로덕션 빌드
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm test           # vitest run
```
