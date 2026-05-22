import { describe, expect, it } from "vitest";
import { applyTone, barColors, barText, hexToRgb, rgbToHex } from "./compose";
import { PROJECT_COLORS, TASK_TYPE_TONES } from "./tokens";

/**
 * The 4 seeded task-type tones over the 8 project colors (docs/design/color-system.md).
 * Columns: 마감(dark0.50) / 작업(tint0.32) / 회의(tint0.56) / 리서치(tint0.82).
 * Parenthesized text colors: 마감 = white, others = black.
 */
const MATRIX: Record<string, [string, string, string, string]> = {
  레드: ["#5D191F", "#CF737B", "#E0A4AA", "#F2DADC"],
  오렌지: ["#5D3919", "#CF9E73", "#E0C1A4", "#F2E5DA"],
  앰버: ["#5D4F19", "#CFBD73", "#E0D4A4", "#F2EEDA"],
  그린: ["#195D35", "#73CF9A", "#A4E0BD", "#DAF2E4"],
  틸: ["#195B5D", "#73CDCF", "#A4DEE0", "#DAF2F2"],
  블루: ["#193B5D", "#73A1CF", "#A4C2E0", "#DAE6F2"],
  인디고: ["#2D195D", "#8F73CF", "#B6A4E0", "#E1DAF2"],
  퍼플: ["#5D194F", "#CF73BD", "#E0A4D4", "#F2DAEE"],
};

describe("hex round-trip", () => {
  it("parses and serializes with and without leading #", () => {
    expect(hexToRgb("#3175B9")).toEqual([49, 117, 185]);
    expect(hexToRgb("3175B9")).toEqual([49, 117, 185]);
    expect(rgbToHex([49, 117, 185])).toBe("#3175B9");
  });

  it("clamps and rounds out-of-range channels", () => {
    expect(rgbToHex([-5, 255.4, 300])).toBe("#00FFFF");
  });
});

describe("applyTone — matches color-system.md §4 matrix exactly", () => {
  for (const { name, color } of PROJECT_COLORS) {
    const expected = MATRIX[name];
    TASK_TYPE_TONES.forEach((tone, col) => {
      it(`${name} × ${tone.name} = ${expected[col]}`, () => {
        expect(applyTone(color, tone)).toBe(expected[col]);
      });
    });
  }
});

describe("applyTone — formula edges", () => {
  it("dark scales toward black (k=1 → black, k=0 → identity)", () => {
    expect(applyTone("#B9313D", { mode: "dark", k: 1 })).toBe("#000000");
    expect(applyTone("#B9313D", { mode: "dark", k: 0 })).toBe("#B9313D");
  });

  it("tint mixes toward white (k=1 → white, k=0 → identity)", () => {
    expect(applyTone("#B9313D", { mode: "tint", k: 1 })).toBe("#FFFFFF");
    expect(applyTone("#B9313D", { mode: "tint", k: 0 })).toBe("#B9313D");
  });
});

describe("barText — auto contrast (white for 마감, black for lighter tones)", () => {
  for (const { name } of PROJECT_COLORS) {
    const [magam, jakeop, hoeui, research] = MATRIX[name];
    it(`${name}: 마감 → white, 작업/회의/리서치 → near-black`, () => {
      expect(barText(magam)).toBe("#FFFFFF");
      expect(barText(jakeop)).toBe("#1A1A1A");
      expect(barText(hoeui)).toBe("#1A1A1A");
      expect(barText(research)).toBe("#1A1A1A");
    });
  }

  it("picks white on pure black and black on pure white", () => {
    expect(barText("#000000")).toBe("#FFFFFF");
    expect(barText("#FFFFFF")).toBe("#1A1A1A");
  });
});

describe("barColors", () => {
  it("combines applyTone + barText", () => {
    // Blue × 마감 (dark 0.40) → #1D466F with white text.
    expect(barColors("#3175B9", { mode: "dark", k: 0.4 })).toEqual({
      background: "#1D466F",
      text: "#FFFFFF",
    });
    // Blue × 리서치 (tint 0.80) → #D6E3F1 with near-black text.
    expect(barColors("#3175B9", { mode: "tint", k: 0.8 })).toEqual({
      background: "#D6E3F1",
      text: "#1A1A1A",
    });
  });
});

describe("distinguishability (AC 3 & 4)", () => {
  it("same project, different task types differ by tone", () => {
    const blue = "#3175B9";
    const shades = TASK_TYPE_TONES.map((t) => applyTone(blue, t));
    expect(new Set(shades).size).toBe(TASK_TYPE_TONES.length);
  });

  it("different projects, same task type differ by hue", () => {
    const tone = TASK_TYPE_TONES[1]; // 작업
    const colors = PROJECT_COLORS.map((p) => applyTone(p.color, tone));
    expect(new Set(colors).size).toBe(PROJECT_COLORS.length);
  });
});
