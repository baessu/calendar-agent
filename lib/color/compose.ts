import type { ToneMode } from "@/lib/types";

/**
 * Tone composition + auto-contrast text for task bars (US-006).
 *
 * Bar background = project identity color with the task-type tone applied:
 *   dark:  out = base × (1 − k)
 *   tint:  out = base × (1 − k) + 255 × k
 * Bar text = white / near-black, whichever has the higher WCAG contrast.
 *
 * These reproduce the confirmed 8-hue × 4-tone matrix in
 * docs/design/color-system.md §4 exactly (verified per channel). Do NOT change
 * the formulas or rounding — the matrix is the source of truth.
 */

const NEAR_BLACK = "#1A1A1A";
const WHITE = "#FFFFFF";

/** Parse "#RRGGBB" (or "RRGGBB") into an [r, g, b] tuple of 0..255 ints. */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace(/^#/, "");
  if (h.length !== 6) throw new Error(`invalid hex color: ${hex}`);
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Serialize an [r, g, b] tuple to "#RRGGBB" (clamped, rounded, uppercase). */
export function rgbToHex(rgb: [number, number, number]): string {
  const part = (c: number) => {
    const v = Math.min(255, Math.max(0, Math.round(c)));
    return v.toString(16).padStart(2, "0").toUpperCase();
  };
  return `#${part(rgb[0])}${part(rgb[1])}${part(rgb[2])}`;
}

/** Apply a task-type tone (dark/tint) over a project base color. */
export function applyTone(hex: string, t: { mode: ToneMode; k: number }): string {
  const rgb = hexToRgb(hex);
  const out = rgb.map((c) =>
    t.mode === "dark" ? c * (1 - t.k) : c * (1 - t.k) + 255 * t.k,
  ) as [number, number, number];
  return rgbToHex(out);
}

/** WCAG relative luminance of an sRGB color (0..1). */
function relativeLuminance(rgb: [number, number, number]): number {
  const lin = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** WCAG contrast ratio between two relative luminances (>= 1). */
function contrastRatio(l1: number, l2: number): number {
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Bar text color: white or near-black, whichever contrasts more with the
 * background. Matches color-system.md §4 (마감 → white, lighter tones → black).
 */
export function barText(bgHex: string): typeof WHITE | typeof NEAR_BLACK {
  const bg = relativeLuminance(hexToRgb(bgHex));
  const onWhite = contrastRatio(bg, 1);
  const onBlack = contrastRatio(bg, 0);
  return onBlack >= onWhite ? NEAR_BLACK : WHITE;
}

/** Resolved bar colors for a project color + task-type tone. */
export function barColors(
  projectColor: string,
  taskType: { mode: ToneMode; k: number },
): { background: string; text: typeof WHITE | typeof NEAR_BLACK } {
  const background = applyTone(projectColor, taskType);
  return { background, text: barText(background) };
}
