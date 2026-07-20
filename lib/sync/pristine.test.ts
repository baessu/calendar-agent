import { describe, expect, it } from "vitest";
import { DEFAULT_PROJECT_NAME, TASK_TYPE_TONES } from "@/lib/color/tokens";
import { isEmptyState, isPristineSeed } from "./pristine";
import { emptySyncState, type SyncState } from "./types";

const PROJECT_ID = "p1";

/** The exact state seedIfEmpty() produces on a fresh device. */
function seededState(): SyncState {
  return {
    ...emptySyncState(),
    projects: [
      {
        id: PROJECT_ID,
        name: DEFAULT_PROJECT_NAME,
        color: "#3175B9",
        visible: true,
        order: 0,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    taskTypes: TASK_TYPE_TONES.map((t, i) => ({
      id: `tt${i}`,
      projectId: PROJECT_ID,
      name: t.name,
      mode: t.mode,
      k: t.k,
      order: t.order,
      createdAt: 1,
      updatedAt: 1,
    })),
  };
}

const aTask = {
  id: "t1",
  projectId: PROJECT_ID,
  taskTypeId: "tt0",
  title: "real work",
  startDate: "2026-07-01",
  endDate: "2026-07-01",
  createdAt: 1,
  updatedAt: 1,
};

describe("isPristineSeed", () => {
  it("recognises the untouched first-run seed", () => {
    expect(isPristineSeed(seededState())).toBe(true);
  });

  it("rejects an empty state (nothing seeded yet)", () => {
    expect(isPristineSeed(emptySyncState())).toBe(false);
  });

  // Each of these means the user has touched this device, so its data must
  // never be silently discarded in favour of the account's copy.
  it("rejects a seed with any task", () => {
    expect(isPristineSeed({ ...seededState(), tasks: [aTask] })).toBe(false);
  });

  it("rejects a seed with any marker", () => {
    const markers = [
      {
        id: "m1",
        kind: "event" as const,
        label: "x",
        date: "2026-07-01",
        projectId: PROJECT_ID,
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    expect(isPristineSeed({ ...seededState(), markers })).toBe(false);
  });

  it("rejects a seed with any tombstone", () => {
    const deletions = [
      { id: "x", table: "tasks" as const, deletedAt: 1 },
    ];
    expect(isPristineSeed({ ...seededState(), deletions })).toBe(false);
  });

  it("rejects a renamed default project", () => {
    const state = seededState();
    state.projects[0].name = "내 프로젝트";
    expect(isPristineSeed(state)).toBe(false);
  });

  it("rejects a second project", () => {
    const state = seededState();
    state.projects.push({ ...state.projects[0], id: "p2", name: "another" });
    expect(isPristineSeed(state)).toBe(false);
  });

  it("rejects an added task type", () => {
    const state = seededState();
    state.taskTypes.push({ ...state.taskTypes[0], id: "extra", name: "커스텀" });
    expect(isPristineSeed(state)).toBe(false);
  });

  it("rejects a removed task type", () => {
    const state = seededState();
    state.taskTypes.pop();
    expect(isPristineSeed(state)).toBe(false);
  });

  it("rejects a renamed task type", () => {
    const state = seededState();
    state.taskTypes[0].name = "리네임";
    expect(isPristineSeed(state)).toBe(false);
  });

  it("rejects task types orphaned from the seeded project", () => {
    const state = seededState();
    state.taskTypes[0].projectId = "other";
    expect(isPristineSeed(state)).toBe(false);
  });
});

describe("isEmptyState", () => {
  it("is true for a brand-new account", () => {
    expect(isEmptyState(emptySyncState())).toBe(true);
  });

  it("is false once the account holds anything", () => {
    expect(isEmptyState({ ...emptySyncState(), tasks: [aTask] })).toBe(false);
    expect(isEmptyState(seededState())).toBe(false);
  });

  it("ignores tombstones — deletions alone are not content", () => {
    const deletions = [{ id: "x", table: "tasks" as const, deletedAt: 1 }];
    expect(isEmptyState({ ...emptySyncState(), deletions })).toBe(true);
  });
});
