import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_LANES, layoutWeek } from "./layout";
import type { WeekSegment } from "./segments";
import type { Task } from "@/lib/types";

/** Build a WeekSegment with only the columns layoutWeek reads. */
function seg(id: string, startCol: number, endCol: number): WeekSegment {
  const task: Task = {
    id,
    projectId: "p",
    taskTypeId: "t",
    title: id,
    startDate: "2026-05-01",
    endDate: "2026-05-01",
    createdAt: 0,
    updatedAt: 0,
  };
  return { task, startCol, endCol, contL: false, contR: false };
}

const lanesById = (segs: WeekSegment[], maxLanes?: number) => {
  const m = new Map<string, number>();
  for (const p of layoutWeek(segs, maxLanes).segments) m.set(p.task.id, p.lane);
  return m;
};

describe("layoutWeek", () => {
  it("returns an empty layout for no segments", () => {
    const layout = layoutWeek([]);
    expect(layout.segments).toEqual([]);
    expect(layout.laneCount).toBe(0);
    expect(layout.overflow).toEqual([]);
  });

  it("keeps a single segment on lane 0", () => {
    const layout = layoutWeek([seg("a", 1, 3)]);
    expect(layout.segments[0].lane).toBe(0);
    expect(layout.laneCount).toBe(1);
  });

  it("puts overlapping segments on different lanes", () => {
    const lanes = lanesById([seg("a", 0, 3), seg("b", 2, 5)]);
    expect(lanes.get("a")).toBe(0);
    expect(lanes.get("b")).toBe(1);
    expect(layoutWeek([seg("a", 0, 3), seg("b", 2, 5)]).laneCount).toBe(2);
  });

  it("treats touching at a single column as overlap (inclusive ranges)", () => {
    // a ends at col 2, b starts at col 2 — they share col 2.
    const lanes = lanesById([seg("a", 0, 2), seg("b", 2, 4)]);
    expect(lanes.get("a")).not.toBe(lanes.get("b"));
  });

  it("reuses a lane when segments do not overlap", () => {
    // a [0,1], b [2,3] — b starts after a ends, so both fit on lane 0.
    const lanes = lanesById([seg("a", 0, 1), seg("b", 2, 3)]);
    expect(lanes.get("a")).toBe(0);
    expect(lanes.get("b")).toBe(0);
    expect(layoutWeek([seg("a", 0, 1), seg("b", 2, 3)]).laneCount).toBe(1);
  });

  it("packs into the minimum number of lanes (= max simultaneous overlap)", () => {
    // Three pairwise-overlapping spans need 3 lanes; a fourth gap-fitting span
    // reuses lane 0.
    const segs = [seg("a", 0, 6), seg("b", 1, 4), seg("c", 2, 3)];
    expect(layoutWeek(segs).laneCount).toBe(3);
  });

  it("reuses the earliest free lane across a gap", () => {
    // a [0,1] lane0; b [0,5] lane1; c [3,4] — a freed lane0 (ended at 1 < 3) → lane0.
    const lanes = lanesById([seg("a", 0, 1), seg("b", 0, 5), seg("c", 3, 4)]);
    expect(lanes.get("a")).toBe(0);
    expect(lanes.get("b")).toBe(1);
    expect(lanes.get("c")).toBe(0);
  });

  it("emits no overflow when lanes stay within maxLanes", () => {
    const layout = layoutWeek([seg("a", 0, 6), seg("b", 0, 6), seg("c", 0, 6)], 3);
    expect(layout.laneCount).toBe(3);
    expect(layout.overflow).toEqual([]);
  });

  it("summarizes lanes beyond maxLanes as per-column '+N' chips", () => {
    // 5 spans all covering cols 1..2 → 5 lanes; with maxLanes 3, lanes 3 and 4
    // (2 bars) overflow, each covering cols 1 and 2.
    const segs = [
      seg("a", 1, 2),
      seg("b", 1, 2),
      seg("c", 1, 2),
      seg("d", 1, 2),
      seg("e", 1, 2),
    ];
    const layout = layoutWeek(segs, 3);
    expect(layout.laneCount).toBe(5);
    expect(layout.overflow).toEqual([
      { col: 1, count: 2 },
      { col: 2, count: 2 },
    ]);
  });

  it("counts overflow per column independently", () => {
    // maxLanes 1: a [0,2] lane0; b [0,0] lane1 (overflow col0); c [2,2] lane1
    // (b ended at 0 < 2 so c reuses lane1 → overflow col2). Cols 0 and 2 each 1.
    const layout = layoutWeek([seg("a", 0, 2), seg("b", 0, 0), seg("c", 2, 2)], 1);
    expect(layout.overflow).toEqual([
      { col: 0, count: 1 },
      { col: 2, count: 1 },
    ]);
  });

  it("defaults maxLanes to DEFAULT_MAX_LANES", () => {
    const segs = Array.from({ length: DEFAULT_MAX_LANES + 1 }, (_, i) =>
      seg(`s${i}`, 0, 6),
    );
    const withDefault = layoutWeek(segs);
    const explicit = layoutWeek(segs, DEFAULT_MAX_LANES);
    expect(withDefault.overflow).toEqual(explicit.overflow);
    expect(withDefault.overflow.length).toBeGreaterThan(0);
  });
});
