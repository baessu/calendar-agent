import { describe, expect, it } from "vitest";
import { filterTasksByProject } from "./view";
import type { Task } from "@/lib/types";

/** Build a Task with just the fields the view filter cares about. */
function task(id: string, projectId: string): Task {
  return {
    id,
    projectId,
    taskTypeId: "t",
    title: id,
    startDate: "2026-05-21",
    endDate: "2026-05-21",
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("filterTasksByProject (US-013 view switch)", () => {
  const a1 = task("a1", "A");
  const a2 = task("a2", "A");
  const b1 = task("b1", "B");
  const tasks = [a1, b1, a2];

  it("merged view (null) returns every task unchanged", () => {
    expect(filterTasksByProject(tasks, null)).toBe(tasks);
  });

  it("merged view on an empty list returns it", () => {
    const empty: Task[] = [];
    expect(filterTasksByProject(empty, null)).toBe(empty);
  });

  it("individual view keeps only the selected project's tasks", () => {
    expect(filterTasksByProject(tasks, "A")).toEqual([a1, a2]);
    expect(filterTasksByProject(tasks, "B")).toEqual([b1]);
  });

  it("preserves original order within the filtered set", () => {
    expect(filterTasksByProject(tasks, "A").map((t) => t.id)).toEqual([
      "a1",
      "a2",
    ]);
  });

  it("unknown project id yields an empty list", () => {
    expect(filterTasksByProject(tasks, "missing")).toEqual([]);
  });

  it("empty input yields an empty list for any project", () => {
    expect(filterTasksByProject([], "A")).toEqual([]);
  });
});
