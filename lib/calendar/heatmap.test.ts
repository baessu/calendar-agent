import { describe, expect, it } from "vitest";
import type { Task } from "@/lib/types";
import { HEAT_LEVELS, heatLevel, taskDensityByDate } from "./heatmap";

/** Minimal task factory (only the date fields these helpers read matter). */
function task(over: Partial<Task>): Task {
  return {
    id: over.id ?? "t",
    projectId: over.projectId ?? "p",
    taskTypeId: over.taskTypeId ?? "tt",
    title: over.title ?? "T",
    startDate: over.startDate ?? "2026-05-10",
    endDate: over.endDate ?? "2026-05-10",
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("taskDensityByDate", () => {
  it("returns an empty map for no tasks", () => {
    expect(taskDensityByDate([]).size).toBe(0);
  });

  it("counts a single-day task on its one date", () => {
    const m = taskDensityByDate([task({ startDate: "2026-05-10", endDate: "2026-05-10" })]);
    expect(m.get("2026-05-10")).toBe(1);
    expect(m.size).toBe(1);
  });

  it("counts each date across a multi-day span inclusively", () => {
    const m = taskDensityByDate([task({ startDate: "2026-05-10", endDate: "2026-05-12" })]);
    expect(m.get("2026-05-10")).toBe(1);
    expect(m.get("2026-05-11")).toBe(1);
    expect(m.get("2026-05-12")).toBe(1);
    expect(m.size).toBe(3);
  });

  it("sums overlapping tasks on the shared days", () => {
    const m = taskDensityByDate([
      task({ id: "a", startDate: "2026-05-10", endDate: "2026-05-12" }),
      task({ id: "b", startDate: "2026-05-11", endDate: "2026-05-13" }),
    ]);
    expect(m.get("2026-05-10")).toBe(1); // only a
    expect(m.get("2026-05-11")).toBe(2); // a + b
    expect(m.get("2026-05-12")).toBe(2); // a + b
    expect(m.get("2026-05-13")).toBe(1); // only b
  });

  it("does not inflate counts for non-overlapping tasks", () => {
    const m = taskDensityByDate([
      task({ id: "a", startDate: "2026-05-10", endDate: "2026-05-10" }),
      task({ id: "b", startDate: "2026-05-20", endDate: "2026-05-20" }),
    ]);
    expect(m.get("2026-05-10")).toBe(1);
    expect(m.get("2026-05-20")).toBe(1);
  });

  it("walks a span across a month boundary without tz drift", () => {
    const m = taskDensityByDate([task({ startDate: "2026-05-31", endDate: "2026-06-02" })]);
    expect(m.get("2026-05-31")).toBe(1);
    expect(m.get("2026-06-01")).toBe(1);
    expect(m.get("2026-06-02")).toBe(1);
    expect(m.size).toBe(3);
  });

  it("clamps a reversed span (end < start) to a single day", () => {
    const m = taskDensityByDate([task({ startDate: "2026-05-12", endDate: "2026-05-10" })]);
    expect(m.get("2026-05-12")).toBe(1);
    expect(m.size).toBe(1);
  });
});

describe("heatLevel", () => {
  it("is 0 for zero or negative counts (no shade)", () => {
    expect(heatLevel(0)).toBe(0);
    expect(heatLevel(-3)).toBe(0);
  });

  it("maps small counts one-to-one", () => {
    expect(heatLevel(1)).toBe(1);
    expect(heatLevel(2)).toBe(2);
    expect(heatLevel(3)).toBe(3);
  });

  it("caps the densest days at HEAT_LEVELS", () => {
    expect(heatLevel(HEAT_LEVELS)).toBe(HEAT_LEVELS);
    expect(heatLevel(HEAT_LEVELS + 1)).toBe(HEAT_LEVELS);
    expect(heatLevel(99)).toBe(HEAT_LEVELS);
  });
});
