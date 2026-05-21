# Ralph Agent Instructions — Monthly Calendar App

You are an autonomous coding agent. Each invocation you complete **exactly one** user story, commit, and stop.

## Per-iteration steps

1. Read `scripts/ralph/prd.json` (the PRD) and `scripts/ralph/progress.txt` (learnings).
2. Read `tasks/prd-monthly-calendar.md` (full PRD) and `docs/design/color-system.md` (confirmed colors) for context.
3. Ensure you are on branch `ralph/monthly-calendar` (from prd.json `branchName`). If not, create it from `main`.
4. Pick the **highest-priority** user story where `passes: false` (lowest `priority` number first; ties → lowest US id).
5. Implement that **single** story to satisfy ALL its `acceptanceCriteria`.
6. Run quality checks: typecheck, lint, and tests. They must pass.
7. Commit: `feat: [US-XXX] - [title]`.
8. Set that story's `passes: true` in `scripts/ralph/prd.json`.
9. Append a progress entry to `scripts/ralph/progress.txt` (format below).

## Design rules (BAKED IN — apply directly; do not redesign)

The confirmed design is in `docs/design/` + the mockup. Match it. If the skills (`ui-ux-pro-max`, `microinteraction`, `ux-design-principles`) ARE available you may invoke them, but the rules below + the mockup are the source of truth.

- **Visual reference (confirmed):** `docs/design/mockups/calendar-layouts.html` — the **F tab** is the target look. Mirror its structure/CSS.
- **Design language:** Swiss editorial — **monochrome UI + hairlines** (border `#8E8E8E`, text `#141414`, bg white). No shadows. Color is used ONLY on task bars (data) — everything else is black/white/gray.
- **Calendar:** **infinite vertical scroll** (months continuous, sticky month header = month name + weekday row, auto-scroll to today on load, title tracks scroll). **No grid lines** — minimal: big day numbers + whitespace, today = filled black circle, other-month days dimmed.
- **Colors:** NEVER invent colors. Use `docs/design/color-system.md`.
  - Project = one of the same-tone 8 colors (`PROJECT_COLORS`, S58 L46). TaskType = tone applied via `applyTone(color, {mode,k})` — 마감 dark0.40 / 작업 tint0.32 / 회의 tint0.56 / 리서치 tint0.80.
  - Bar text = `barText()` util: white/black by WCAG contrast (computed). All 32 combos are AA+ in color-system.md §4.
- **Markers:** event/hard-deadline are point-date chips, monochrome (NOT colored): deadline = filled black `⚑ label`, event = outlined `◆ label`. Distinct from colored bars.
- **Layout:** top project tabs (전체 + projects, underline-active) + center infinite-scroll calendar + right "할일" list (count badge, date-sorted, legends, ＋할일추가). Korean UI copy; English code comments.
- **Typography:** `docs/design/typography.md` — `@font-face`+`unicode-range`: Latin=Plain(400, paid), digits+Hangul=IBM Plex Sans KR(free, Google Fonts). letter-spacing -0.03em. tabular-nums for dates. (woff2 files needed; fall back gracefully if absent.)
- **Micro-interactions** (US-004 drag-select, US-005 bar appear, US-010 drag-move): live preview during drag; subtle enter animation; clear hover; click(edit) vs drag(move) via 4px threshold. Subtle, not flashy.
- **Dates:** store as `YYYY-MM-DD` strings; compare via UTC/local-midnight utils (no tz drift).
- **Pure logic separated + tested:** `lib/calendar/layout.ts` (lane stacking), `lib/calendar/infinite.ts` (week range + month grouping), `lib/color/` (applyTone + barText) must have unit tests.

## "Verify in browser" criteria

You run headless and CANNOT visually verify. For any acceptance criterion that says "Verify in browser":
- Make typecheck/lint/tests green, and ensure the code path is implemented.
- Do NOT block the story on visual confirmation.
- In `progress.txt`, list which "Verify in browser" items still need a human visual pass.

## Progress report format (APPEND to progress.txt)

```
## [ISO datetime] - US-XXX
- What was implemented
- Files changed
- Needs human browser verification: [list, or "none"]
- Learnings for future iterations:
  - Patterns / gotchas
---
```

## Stop condition

If ALL stories have `passes: true`, reply with exactly:
<promise>COMPLETE</promise>

## Important

- ONE story per iteration. Commit frequently. Keep CI green.
- Do not start a story whose dependencies (lower-priority stories) are not yet `passes: true`, unless independent.
- Do not regenerate the color system or change confirmed hue/tone values.
