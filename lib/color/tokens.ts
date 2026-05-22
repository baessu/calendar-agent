import type { ToneMode } from "@/lib/types";

/**
 * Confirmed color seeds from docs/design/color-system.md.
 * Do NOT invent or change these hue/tone values (§2, §3, §6).
 *
 * Only seed data lives here; tone composition (applyTone/barText) is US-006.
 */

/** Project hues — same tone (S 58%, L 46%), 8 hues. Identity colors. */
export const PROJECT_COLORS = [
  { name: "레드", color: "#B9313D" },
  { name: "오렌지", color: "#B97131" },
  { name: "앰버", color: "#B99E31" },
  { name: "그린", color: "#31B96A" },
  { name: "틸", color: "#31B5B9" },
  { name: "블루", color: "#3175B9" },
  { name: "인디고", color: "#5A31B9" },
  { name: "퍼플", color: "#B9319E" },
] as const;

/**
 * Tone ladder — 8 distinguishable steps, darkest → lightest. Bar bg =
 * applyTone(projectColor, step). All 8 hues × 8 steps = 64 combos pass WCAG AA
 * (auto black/white text): 3 dark steps (white text) + 5 tint steps (black
 * text); the mid dead-zone (~base L) is intentionally skipped. (color-system.md §3)
 */
export const TONE_LADDER: ReadonlyArray<{ mode: ToneMode; k: number }> = [
  { mode: "dark", k: 0.5 },
  { mode: "dark", k: 0.43 },
  { mode: "dark", k: 0.36 },
  { mode: "tint", k: 0.32 },
  { mode: "tint", k: 0.44 },
  { mode: "tint", k: 0.56 },
  { mode: "tint", k: 0.68 },
  { mode: "tint", k: 0.82 },
];

/** Seeded default task types (4) mapped onto ladder steps, 마감 → 리서치. */
export const TASK_TYPE_TONES: ReadonlyArray<{
  name: string;
  mode: ToneMode;
  k: number;
  order: number;
}> = [
  { name: "마감", mode: "dark", k: 0.5, order: 0 }, // ladder[0]
  { name: "작업", mode: "tint", k: 0.32, order: 1 }, // ladder[3]
  { name: "회의", mode: "tint", k: 0.56, order: 2 }, // ladder[5]
  { name: "리서치", mode: "tint", k: 0.82, order: 3 }, // ladder[7]
];

/** Color used for the seeded default ("기본") project — 블루. */
export const DEFAULT_PROJECT_COLOR = "#3175B9";

/** Name of the seeded default project. */
export const DEFAULT_PROJECT_NAME = "기본";
