import { describe, expect, it } from "vitest";
import {
  SNAPSHOT_VERSION,
  buildSnapshot,
  computeRange,
  monthOf,
  parseSnapshot,
} from "./snapshot";
import { isValidToken, newShareToken, snapshotPath } from "./token";
import type { Marker, Project, Task, TaskType } from "@/lib/types";

const project: Project = {
  id: "pA",
  name: "마케팅",
  color: "#3175B9",
  visible: true,
  order: 0,
  createdAt: 0,
  updatedAt: 0,
};

function task(p: Partial<Task> & { id: string }): Task {
  return {
    projectId: "pA",
    taskTypeId: "t1",
    title: p.id,
    startDate: "2026-05-10",
    endDate: "2026-05-12",
    createdAt: 0,
    updatedAt: 0,
    ...p,
  };
}

function taskType(p: Partial<TaskType> & { id: string }): TaskType {
  return {
    projectId: "pA",
    name: p.id,
    mode: "tint",
    k: 0.32,
    order: 0,
    createdAt: 0,
    ...p,
    updatedAt: p.updatedAt ?? p.createdAt ?? 0,
  };
}

function marker(p: Partial<Marker> & { id: string }): Marker {
  return {
    kind: "event",
    label: p.id,
    date: "2026-05-15",
    projectId: "pA",
    createdAt: 0,
    ...p,
    updatedAt: p.updatedAt ?? p.createdAt ?? 0,
  };
}

describe("monthOf", () => {
  it("reads the 1-based year/month from a YYYY-MM-DD date", () => {
    expect(monthOf("2026-05-21")).toEqual({ year: 2026, month: 5 });
    expect(monthOf("2026-12-01")).toEqual({ year: 2026, month: 12 });
  });
});

describe("computeRange", () => {
  it("spans the earliest start to the latest end across tasks and markers", () => {
    const range = computeRange(
      [
        { startDate: "2026-03-28", endDate: "2026-04-02" },
        { startDate: "2026-05-10", endDate: "2026-05-12" },
      ],
      [{ date: "2026-07-01" }],
    );
    expect(range).toEqual({
      from: { year: 2026, month: 3 },
      to: { year: 2026, month: 7 },
    });
  });

  it("falls back to the single month of `now` when there is no data", () => {
    const range = computeRange([], [], new Date("2026-09-15T12:00:00Z"));
    expect(range).toEqual({
      from: { year: 2026, month: 9 },
      to: { year: 2026, month: 9 },
    });
  });
});

describe("buildSnapshot", () => {
  it("includes only the project's own data, sorted, with notes", () => {
    const snap = buildSnapshot(
      project,
      [
        taskType({ id: "tt1", order: 1 }),
        taskType({ id: "tt0", order: 0 }),
        taskType({ id: "other", projectId: "pB", order: 0 }),
      ],
      [
        task({ id: "late", startDate: "2026-05-20", endDate: "2026-05-22" }),
        task({ id: "early", startDate: "2026-05-01", endDate: "2026-05-03", note: "메모" }),
        task({ id: "foreign", projectId: "pB" }),
      ],
      [marker({ id: "m1" }), marker({ id: "mForeign", projectId: "pB" })],
      new Date("2026-05-26T00:00:00Z"),
    );

    expect(snap.v).toBe(SNAPSHOT_VERSION);
    expect(snap.project).toEqual({ id: "pA", name: "마케팅", color: "#3175B9" });
    expect(snap.taskTypes.map((t) => t.id)).toEqual(["tt0", "tt1"]);
    expect(snap.tasks.map((t) => t.id)).toEqual(["early", "late"]);
    expect(snap.tasks.find((t) => t.id === "early")?.note).toBe("메모");
    expect(snap.markers.map((m) => m.id)).toEqual(["m1"]);
    expect(snap.range).toEqual({
      from: { year: 2026, month: 5 },
      to: { year: 2026, month: 5 },
    });
  });
});

describe("parseSnapshot", () => {
  it("round-trips a built snapshot through JSON", () => {
    const snap = buildSnapshot(project, [taskType({ id: "tt0" })], [task({ id: "x" })], []);
    const parsed = parseSnapshot(JSON.parse(JSON.stringify(snap)));
    expect(parsed).toEqual(snap);
  });

  it("rejects malformed or unknown-version payloads", () => {
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot({})).toBeNull();
    expect(parseSnapshot({ v: 99 })).toBeNull();
    expect(parseSnapshot({ v: 1, project: {}, taskTypes: [], tasks: [], markers: [] })).toBeNull();
  });
});

describe("share token", () => {
  it("generates URL-safe tokens of the requested length", () => {
    const tok = newShareToken();
    expect(isValidToken(tok)).toBe(true);
    expect(tok).toMatch(/^[0-9a-z]+$/);
  });

  it("produces distinct tokens (no obvious collisions)", () => {
    const set = new Set(Array.from({ length: 500 }, () => newShareToken()));
    expect(set.size).toBe(500);
  });

  it("validates token shape and builds the blob path", () => {
    expect(isValidToken("short")).toBe(false);
    expect(isValidToken("BadCase123456789")).toBe(false);
    expect(snapshotPath("abc123def456ghi789")).toBe("shares/abc123def456ghi789.json");
  });
});
