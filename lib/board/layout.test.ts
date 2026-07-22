import { describe, expect, it } from "vitest";
import {
  clusterColumns,
  defaultPositions,
  estimateClusterSize,
  worldBounds,
} from "./layout";

describe("clusterColumns", () => {
  it("widens with task count", () => {
    expect(clusterColumns(1)).toBe(1);
    expect(clusterColumns(2)).toBe(1);
    expect(clusterColumns(3)).toBe(2);
    expect(clusterColumns(6)).toBe(2);
    expect(clusterColumns(7)).toBe(3);
    expect(clusterColumns(20)).toBe(3);
  });
});

describe("estimateClusterSize", () => {
  it("is taller with more rows and wider with more columns", () => {
    const small = estimateClusterSize(1);
    const big = estimateClusterSize(15);
    expect(big.w).toBeGreaterThan(small.w);
    expect(big.h).toBeGreaterThan(small.h);
  });

  it("never returns a zero-height box for an empty count", () => {
    expect(estimateClusterSize(0).h).toBeGreaterThan(0);
  });
});

describe("defaultPositions", () => {
  const metas = [
    { project: "A", count: 15 },
    { project: "B", count: 9 },
    { project: "C", count: 2 },
    { project: "D", count: 2 },
    { project: "E", count: 1 },
  ];

  it("places every cluster", () => {
    const pos = defaultPositions(metas);
    expect(Object.keys(pos).sort()).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("is deterministic (same input → same output)", () => {
    expect(defaultPositions(metas)).toEqual(defaultPositions(metas));
  });

  it("wraps to a new row when a cluster would exceed maxWidth", () => {
    // A narrow maxWidth forces one cluster per row → strictly increasing y.
    const pos = defaultPositions(metas, 200);
    const ys = metas.map((m) => pos[m.project].y);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThan(ys[i - 1]);
  });

  it("does not overlap horizontally within a row", () => {
    const wide = defaultPositions(metas, 100000); // all on one row
    const sorted = metas
      .map((m) => ({ ...m, ...pos(wide, m.project), ...estimateClusterSize(m.count) }))
      .sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].x).toBeGreaterThanOrEqual(sorted[i - 1].x + sorted[i - 1].w);
    }
  });
});

describe("worldBounds", () => {
  it("frames the farthest cluster plus padding", () => {
    const b = worldBounds(
      [
        { pos: { x: 0, y: 0 }, size: { w: 100, h: 50 } },
        { pos: { x: 200, y: 300 }, size: { w: 100, h: 50 } },
      ],
      60,
    );
    expect(b.w).toBe(200 + 100 + 60);
    expect(b.h).toBe(300 + 50 + 60);
  });

  it("returns just padding for no clusters", () => {
    expect(worldBounds([], 60)).toEqual({ w: 60, h: 60 });
  });
});

function pos(map: Record<string, { x: number; y: number }>, k: string) {
  return map[k];
}
