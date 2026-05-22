import { describe, expect, it } from "vitest";
import { resizeRange } from "./resize";

describe("resizeRange — start edge (left)", () => {
  it("extends earlier when dragged left of the current start", () => {
    expect(resizeRange("2026-05-21", "2026-05-24", "start", "2026-05-18")).toEqual({
      start: "2026-05-18",
      end: "2026-05-24",
    });
  });

  it("shrinks when dragged right (later) but still before the end", () => {
    expect(resizeRange("2026-05-21", "2026-05-24", "start", "2026-05-23")).toEqual({
      start: "2026-05-23",
      end: "2026-05-24",
    });
  });

  it("clamps to the end when dragged past it (single-day task) — AC2", () => {
    expect(resizeRange("2026-05-21", "2026-05-24", "start", "2026-05-27")).toEqual({
      start: "2026-05-24",
      end: "2026-05-24",
    });
  });

  it("collapses to a single day when dragged onto the end", () => {
    expect(resizeRange("2026-05-21", "2026-05-24", "start", "2026-05-24")).toEqual({
      start: "2026-05-24",
      end: "2026-05-24",
    });
  });

  it("is a no-op when dropped on the current start", () => {
    expect(resizeRange("2026-05-21", "2026-05-24", "start", "2026-05-21")).toEqual({
      start: "2026-05-21",
      end: "2026-05-24",
    });
  });

  it("extends a single-day task to the left", () => {
    expect(resizeRange("2026-05-21", "2026-05-21", "start", "2026-05-19")).toEqual({
      start: "2026-05-19",
      end: "2026-05-21",
    });
  });
});

describe("resizeRange — end edge (right)", () => {
  it("extends later when dragged right of the current end", () => {
    expect(resizeRange("2026-05-21", "2026-05-24", "end", "2026-05-28")).toEqual({
      start: "2026-05-21",
      end: "2026-05-28",
    });
  });

  it("shrinks when dragged left (earlier) but still after the start", () => {
    expect(resizeRange("2026-05-21", "2026-05-24", "end", "2026-05-22")).toEqual({
      start: "2026-05-21",
      end: "2026-05-22",
    });
  });

  it("clamps to the start when dragged before it (single-day task) — AC2", () => {
    expect(resizeRange("2026-05-21", "2026-05-24", "end", "2026-05-18")).toEqual({
      start: "2026-05-21",
      end: "2026-05-21",
    });
  });

  it("collapses to a single day when dragged onto the start", () => {
    expect(resizeRange("2026-05-21", "2026-05-24", "end", "2026-05-21")).toEqual({
      start: "2026-05-21",
      end: "2026-05-21",
    });
  });

  it("is a no-op when dropped on the current end", () => {
    expect(resizeRange("2026-05-21", "2026-05-24", "end", "2026-05-24")).toEqual({
      start: "2026-05-21",
      end: "2026-05-24",
    });
  });

  it("extends a single-day task to the right", () => {
    expect(resizeRange("2026-05-21", "2026-05-21", "end", "2026-05-23")).toEqual({
      start: "2026-05-21",
      end: "2026-05-23",
    });
  });
});

describe("resizeRange — boundaries", () => {
  it("extends the start across a month boundary", () => {
    expect(resizeRange("2026-06-02", "2026-06-05", "start", "2026-05-30")).toEqual({
      start: "2026-05-30",
      end: "2026-06-05",
    });
  });

  it("extends the end across a month boundary", () => {
    expect(resizeRange("2026-05-30", "2026-05-31", "end", "2026-06-03")).toEqual({
      start: "2026-05-30",
      end: "2026-06-03",
    });
  });

  it("extends the end across a year boundary", () => {
    expect(resizeRange("2026-12-30", "2026-12-31", "end", "2027-01-02")).toEqual({
      start: "2026-12-30",
      end: "2027-01-02",
    });
  });
});
