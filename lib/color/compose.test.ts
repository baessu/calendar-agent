import { describe, expect, it } from "vitest";
import { applyTone, barColors, barText, hexToRgb, rgbToHex } from "./compose";
import { PROJECT_COLORS, TASK_TYPE_TONES } from "./tokens";

/**
 * The 4 seeded task-type tones over the 8 project colors (docs/design/color-system.md).
 * Columns match TASK_TYPE_TONES order: 리서치(tint0.82) / 회의(tint0.56) / 작업(tint0.32) / 마감(dark0.50).
 * Text colors: 마감 = white, others = black.
 */
const MATRIX: Record<string, [string, string, string, string]> = {
  레드: ["#F2DADC", "#E0A4AA", "#CF737B", "#5D191F"],
  오렌지: ["#F2E5DA", "#E0C1A4", "#CF9E73", "#5D3919"],
  앰버: ["#F2EEDA", "#E0D4A4", "#CFBD73", "#5D4F19"],
  그린: ["#DAF2E4", "#A4E0BD", "#73CF9A", "#195D35"],
  틸: ["#DAF2F2", "#A4DEE0", "#73CDCF", "#195B5D"],
  블루: ["#DAE6F2", "#A4C2E0", "#73A1CF", "#193B5D"],
  인디고: ["#E1DAF2", "#B6A4E0", "#8F73CF", "#2D195D"],
  퍼플: ["#F2DAEE", "#E0A4D4", "#CF73BD", "#5D194F"],
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
    // MATRIX columns: 리서치 / 회의 / 작업 / 마감.
    const [research, hoeui, jakeop, magam] = MATRIX[name];
    it(`${name}: 마감 → white, 리서치/회의/작업 → near-black`, () => {
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
    const tone = TASK_TYPE_TONES[1]; // 회의
    const colors = PROJECT_COLORS.map((p) => applyTone(p.color, tone));
    expect(new Set(colors).size).toBe(PROJECT_COLORS.length);
  });
});
