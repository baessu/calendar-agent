import { beforeEach, describe, expect, it } from "vitest";
import { addPeriod, deletePeriod, readPeriods, updatePeriod } from "./store";

beforeEach(() => {
  window.localStorage.clear();
});

describe("addPeriod", () => {
  it("adds a period and reads it back", () => {
    addPeriod({ project: "MDT", startDate: "2026-08-01", endDate: "2026-08-18" });
    const all = readPeriods();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      project: "MDT",
      startDate: "2026-08-01",
      endDate: "2026-08-18",
    });
    expect(all[0].id).toBeTruthy();
  });

  it("normalizes a reversed range so start ≤ end", () => {
    const [p] = addPeriod({ project: "X", startDate: "2026-08-18", endDate: "2026-08-01" });
    expect(p.startDate).toBe("2026-08-01");
    expect(p.endDate).toBe("2026-08-18");
  });

  it("keeps multiple periods", () => {
    addPeriod({ project: "A", startDate: "2026-08-01", endDate: "2026-08-02" });
    addPeriod({ project: "B", startDate: "2026-08-03", endDate: "2026-08-04" });
    expect(readPeriods().map((p) => p.project).sort()).toEqual(["A", "B"]);
  });
});

describe("updatePeriod", () => {
  it("patches dates and re-normalizes", () => {
    const [p] = addPeriod({ project: "A", startDate: "2026-08-01", endDate: "2026-08-05" });
    updatePeriod(p.id, { endDate: "2026-07-20" }); // now before start → swap
    const after = readPeriods()[0];
    expect(after.startDate).toBe("2026-07-20");
    expect(after.endDate).toBe("2026-08-01");
  });

  it("leaves other periods untouched", () => {
    const list = addPeriod({ project: "A", startDate: "2026-08-01", endDate: "2026-08-02" });
    addPeriod({ project: "B", startDate: "2026-08-03", endDate: "2026-08-04" });
    updatePeriod(list[0].id, { project: "A2" });
    const projects = readPeriods().map((p) => p.project).sort();
    expect(projects).toEqual(["A2", "B"]);
  });
});

describe("deletePeriod", () => {
  it("removes only the target", () => {
    const l = addPeriod({ project: "A", startDate: "2026-08-01", endDate: "2026-08-02" });
    addPeriod({ project: "B", startDate: "2026-08-03", endDate: "2026-08-04" });
    deletePeriod(l[0].id);
    expect(readPeriods().map((p) => p.project)).toEqual(["B"]);
  });
});

describe("readPeriods", () => {
  it("returns [] and doesn't throw on garbage in storage", () => {
    window.localStorage.setItem("project-periods-v1", "not json{");
    expect(readPeriods()).toEqual([]);
  });

  it("drops malformed entries", () => {
    window.localStorage.setItem(
      "project-periods-v1",
      JSON.stringify([{ id: "ok", project: "A", startDate: "2026-08-01", endDate: "2026-08-02" }, { id: "bad" }]),
    );
    expect(readPeriods().map((p) => p.id)).toEqual(["ok"]);
  });
});
