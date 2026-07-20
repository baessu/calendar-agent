import { describe, expect, it } from "vitest";
import { TASK_TYPE_TONES } from "@/lib/color/tokens";
import type { Task, TaskType } from "@/lib/types";
import {
  defaultTaskTypesForProject,
  matchTaskTypeAcrossProjects,
  planTaskTypeScopeMigration,
  taskTypesForProject,
} from "./scope";

/** Deterministic id generator for tests (g0, g1, …). */
function idGen() {
  let n = 0;
  return () => `g${n++}`;
}

/** Build a TaskType with only the fields a test cares about. */
function tt(p: Partial<TaskType> & { id: string; projectId: string }): TaskType {
  return {
    name: p.id,
    mode: "tint",
    k: 0.32,
    order: 0,
    createdAt: 0,
    ...p,
    updatedAt: p.updatedAt ?? p.createdAt ?? 0,
  };
}

/** Build a Task with only the fields a test cares about. */
function task(p: Partial<Task> & { id: string }): Task {
  return {
    projectId: "p1",
    taskTypeId: "t1",
    title: p.id,
    startDate: "2026-05-01",
    endDate: "2026-05-01",
    createdAt: 0,
    updatedAt: 0,
    ...p,
  };
}

describe("defaultTaskTypesForProject", () => {
  it("builds the 4 confirmed types, all owned by the project", () => {
    const types = defaultTaskTypesForProject("pA", idGen(), 100);
    expect(types).toHaveLength(TASK_TYPE_TONES.length);
    expect(types.map((t) => t.name)).toEqual(TASK_TYPE_TONES.map((t) => t.name));
    expect(types.map((t) => `${t.mode}:${t.k}`)).toEqual(
      TASK_TYPE_TONES.map((t) => `${t.mode}:${t.k}`),
    );
    expect(types.every((t) => t.projectId === "pA")).toBe(true);
    expect(types.every((t) => t.createdAt === 100)).toBe(true);
    expect(new Set(types.map((t) => t.id)).size).toBe(types.length); // unique ids
  });
});

describe("taskTypesForProject", () => {
  it("filters to the project's types and sorts by order", () => {
    const all = [
      tt({ id: "a2", projectId: "p1", order: 2 }),
      tt({ id: "b0", projectId: "p2", order: 0 }),
      tt({ id: "a0", projectId: "p1", order: 0 }),
      tt({ id: "a1", projectId: "p1", order: 1 }),
    ];
    expect(taskTypesForProject(all, "p1").map((t) => t.id)).toEqual([
      "a0",
      "a1",
      "a2",
    ]);
    expect(taskTypesForProject(all, "p2").map((t) => t.id)).toEqual(["b0"]);
    expect(taskTypesForProject(all, "nope")).toEqual([]);
  });
});

describe("planTaskTypeScopeMigration", () => {
  it("clones each global type into every project and removes the originals", () => {
    const projects = [{ id: "p1" }, { id: "p2" }];
    const global = [
      tt({ id: "g-research", projectId: "", name: "리서치", order: 0 }),
      tt({ id: "g-work", projectId: "", name: "작업", order: 1 }),
    ];
    const plan = planTaskTypeScopeMigration(projects, global, [], idGen(), 7);

    // 2 projects × 2 types = 4 clones, each owned by a project with fresh ids.
    expect(plan.taskTypes).toHaveLength(4);
    expect(plan.taskTypes.filter((t) => t.projectId === "p1")).toHaveLength(2);
    expect(plan.taskTypes.filter((t) => t.projectId === "p2")).toHaveLength(2);
    expect(plan.taskTypes.every((t) => t.createdAt === 7)).toBe(true);
    // Clone names/tones mirror the originals.
    expect(
      plan.taskTypes
        .filter((t) => t.projectId === "p1")
        .map((t) => t.name),
    ).toEqual(["리서치", "작업"]);
    // Originals are scheduled for removal.
    expect(plan.removeTaskTypeIds).toEqual(["g-research", "g-work"]);
  });

  it("relinks each task to its own project's clone of the same type", () => {
    const projects = [{ id: "p1" }, { id: "p2" }];
    const global = [tt({ id: "g-work", projectId: "", name: "작업" })];
    const tasks = [
      task({ id: "t-a", projectId: "p1", taskTypeId: "g-work" }),
      task({ id: "t-b", projectId: "p2", taskTypeId: "g-work" }),
    ];
    const plan = planTaskTypeScopeMigration(projects, global, tasks, idGen(), 0);

    const clone = (pid: string) =>
      plan.taskTypes.find((t) => t.projectId === pid)!.id;
    const relink = new Map(plan.relinks.map((r) => [r.id, r.taskTypeId]));
    expect(relink.get("t-a")).toBe(clone("p1"));
    expect(relink.get("t-b")).toBe(clone("p2"));
    // Each task points at a clone owned by its own project.
    expect(relink.get("t-a")).not.toBe(relink.get("t-b"));
  });

  it("leaves orphan tasks (unknown project or type) unlinked", () => {
    const projects = [{ id: "p1" }];
    const global = [tt({ id: "g1", projectId: "", name: "작업" })];
    const tasks = [
      task({ id: "ok", projectId: "p1", taskTypeId: "g1" }),
      task({ id: "orphan-project", projectId: "pX", taskTypeId: "g1" }),
      task({ id: "orphan-type", projectId: "p1", taskTypeId: "gX" }),
    ];
    const plan = planTaskTypeScopeMigration(projects, global, tasks, idGen(), 0);
    expect(plan.relinks.map((r) => r.id)).toEqual(["ok"]);
  });
});

describe("matchTaskTypeAcrossProjects", () => {
  const all = [
    tt({ id: "p1-work", projectId: "p1", name: "작업", order: 1 }),
    tt({ id: "p2-research", projectId: "p2", name: "리서치", order: 0 }),
    tt({ id: "p2-work", projectId: "p2", name: "작업", order: 1 }),
  ];

  it("matches the destination type with the same name", () => {
    expect(matchTaskTypeAcrossProjects("p1-work", all, "p2")).toBe("p2-work");
  });

  it("falls back to the destination's default type when no name matches", () => {
    const src = [...all, tt({ id: "p1-odd", projectId: "p1", name: "특이", order: 5 })];
    // "특이" has no counterpart in p2 → p2's default (smallest order = 리서치).
    expect(matchTaskTypeAcrossProjects("p1-odd", src, "p2")).toBe("p2-research");
  });

  it("returns null when the destination project has no types", () => {
    expect(matchTaskTypeAcrossProjects("p1-work", all, "empty")).toBeNull();
  });
});
