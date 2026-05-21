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

/** Global task-type tones (dark/tint ladder), 마감 → 리서치. */
export const TASK_TYPE_TONES: ReadonlyArray<{
  name: string;
  mode: ToneMode;
  k: number;
  order: number;
}> = [
  { name: "마감", mode: "dark", k: 0.4, order: 0 },
  { name: "작업", mode: "tint", k: 0.32, order: 1 },
  { name: "회의", mode: "tint", k: 0.56, order: 2 },
  { name: "리서치", mode: "tint", k: 0.8, order: 3 },
];

/** Color used for the seeded default ("기본") project — 블루. */
export const DEFAULT_PROJECT_COLOR = "#3175B9";

/** Name of the seeded default project. */
export const DEFAULT_PROJECT_NAME = "기본";
