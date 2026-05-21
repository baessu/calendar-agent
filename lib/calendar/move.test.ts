import { describe, expect, it } from "vitest";
import { diffDays, parseDate } from "./dates";
import { moveTaskByDrag, shiftRange } from "./move";

describe("shiftRange", () => {
  it("shifts a multi-day span forward", () => {
    expect(shiftRange("2026-05-21", "2026-05-24", 3)).toEqual({
      start: "2026-05-24",
      end: "2026-05-27",
    });
  });

  it("shifts backward with a negative delta", () => {
    expect(shiftRange("2026-05-21", "2026-05-24", -3)).toEqual({
      start: "2026-05-18",
      end: "2026-05-21",
    });
  });

  it("returns the same range for a zero delta", () => {
    expect(shiftRange("2026-05-21", "2026-05-24", 0)).toEqual({
      start: "2026-05-21",
      end: "2026-05-24",
    });
  });

  it("keeps a single-day task single", () => {
    expect(shiftRange("2026-05-21", "2026-05-21", 5)).toEqual({
      start: "2026-05-26",
      end: "2026-05-26",
    });
  });

  it("shifts across a month boundary", () => {
    expect(shiftRange("2026-05-30", "2026-05-31", 3)).toEqual({
      start: "2026-06-02",
      end: "2026-06-03",
    });
  });

  it("shifts across a year boundary", () => {
    expect(shiftRange("2026-12-30", "2026-12-31", 3)).toEqual({
      start: "2027-01-02",
      end: "2027-01-03",
    });
  });
});

describe("moveTaskByDrag", () => {
  it("leaves the range unchanged when grab === drop", () => {
    expect(moveTaskByDrag("2026-05-21", "2026-05-24", "2026-05-22", "2026-05-22")).toEqual({
      start: "2026-05-21",
      end: "2026-05-24",
    });
  });

  it("moves so the grabbed day lands on the dropped day (grabbed mid-bar)", () => {
    // Grabbed the 22nd, dropped on the 25th -> +3 days for the whole span.
    expect(moveTaskByDrag("2026-05-21", "2026-05-24", "2026-05-22", "2026-05-25")).toEqual({
      start: "2026-05-24",
      end: "2026-05-27",
    });
  });

  it("moves earlier when dropped before the grab point", () => {
    expect(moveTaskByDrag("2026-05-21", "2026-05-24", "2026-05-23", "2026-05-20")).toEqual({
      start: "2026-05-18",
      end: "2026-05-21",
    });
  });

  it("preserves duration across a week boundary", () => {
    const before = diffDays(parseDate("2026-05-21"), parseDate("2026-05-24"));
    const moved = moveTaskByDrag("2026-05-21", "2026-05-24", "2026-05-21", "2026-05-28");
    const after = diffDays(parseDate(moved.start), parseDate(moved.end));
    expect(after).toBe(before);
    expect(moved).toEqual({ start: "2026-05-28", end: "2026-05-31" });
  });

  it("preserves duration across a month boundary", () => {
    const moved = moveTaskByDrag("2026-05-28", "2026-05-30", "2026-05-28", "2026-06-03");
    expect(moved).toEqual({ start: "2026-06-03", end: "2026-06-05" });
  });
});
