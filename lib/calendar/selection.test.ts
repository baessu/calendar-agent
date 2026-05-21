import { describe, expect, it } from "vitest";
import { formatRangeLabel, isWithinRange, normalizeRange } from "./selection";

describe("normalizeRange", () => {
  it("keeps forward order", () => {
    expect(normalizeRange("2026-05-21", "2026-05-24")).toEqual({
      start: "2026-05-21",
      end: "2026-05-24",
    });
  });

  it("normalizes a reverse drag (end -> start)", () => {
    expect(normalizeRange("2026-05-24", "2026-05-21")).toEqual({
      start: "2026-05-21",
      end: "2026-05-24",
    });
  });

  it("handles a single-day selection (anchor === current)", () => {
    expect(normalizeRange("2026-05-21", "2026-05-21")).toEqual({
      start: "2026-05-21",
      end: "2026-05-21",
    });
  });

  it("normalizes across a month boundary", () => {
    expect(normalizeRange("2026-06-02", "2026-05-30")).toEqual({
      start: "2026-05-30",
      end: "2026-06-02",
    });
  });
});

describe("isWithinRange", () => {
  it("is true at both inclusive ends", () => {
    expect(isWithinRange("2026-05-21", "2026-05-21", "2026-05-24")).toBe(true);
    expect(isWithinRange("2026-05-24", "2026-05-21", "2026-05-24")).toBe(true);
  });

  it("is true strictly inside", () => {
    expect(isWithinRange("2026-05-22", "2026-05-21", "2026-05-24")).toBe(true);
  });

  it("is false outside the range", () => {
    expect(isWithinRange("2026-05-20", "2026-05-21", "2026-05-24")).toBe(false);
    expect(isWithinRange("2026-05-25", "2026-05-21", "2026-05-24")).toBe(false);
  });

  it("works for a single-day range", () => {
    expect(isWithinRange("2026-05-21", "2026-05-21", "2026-05-21")).toBe(true);
    expect(isWithinRange("2026-05-22", "2026-05-21", "2026-05-21")).toBe(false);
  });
});

describe("formatRangeLabel", () => {
  it("shows a single date with no tilde", () => {
    expect(formatRangeLabel("2026-05-21", "2026-05-21")).toBe("5/21");
  });

  it("shows start ~ end for a multi-day span", () => {
    expect(formatRangeLabel("2026-05-21", "2026-05-24")).toBe("5/21 ~ 5/24");
  });

  it("strips leading zeros on month and day", () => {
    expect(formatRangeLabel("2026-01-05", "2026-01-09")).toBe("1/5 ~ 1/9");
  });

  it("formats a cross-month span", () => {
    expect(formatRangeLabel("2026-05-30", "2026-06-02")).toBe("5/30 ~ 6/2");
  });
});
