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

These are distilled from the project's design skills so you don't depend on them being loaded. If the skills (`ui-ux-pro-max`, `microinteraction`, `ux-design-principles`) ARE available in this environment, you may invoke them for the current story — but the rules below are the source of truth.

- **Colors:** NEVER invent colors. Use `docs/design/color-system.md`.
  - Bar background = `hsl(project.hue, taskType.saturation, taskType.lightness)`.
  - Bar text = `barText()` util: pick white/black by WCAG contrast (computed, not a fixed L threshold).
  - Seed hues/tones come from `PROJECT_HUES` / `TASK_TYPE_TONES` in color-system.md §4.
- **Layout:** 3-pane — left sidebar (project toggles + 2 legends) · center calendar · right task panel. Generous whitespace, minimal shadows, rounded bars.
- **UX (flows):** progressive disclosure — the create popover asks only title + project + task-type. One primary action per screen. Clear empty states ("일칸을 드래그해 첫 할일을 추가하세요"). Korean UI copy; English code comments.
- **Micro-interactions** (esp. US-004 drag-select, US-005 bar appear, US-010 drag-move): show a live preview during drag; subtle enter animation on bar create; clear hover state; distinguish click(edit) vs drag(move) with a 4px movement threshold. Keep motion subtle, not flashy.
- **Dates:** store as `YYYY-MM-DD` strings; compare via local-midnight utils (no timezone drift). Use tabular-nums for date numerals.
- **Pure logic separated + tested:** `lib/calendar/layout.ts` (lane stacking) and `lib/color/` (compose + contrast) must have unit tests.

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
