import { describe, expect, it } from "vitest";
import {
  filterTasksByProject,
  filterTasksByTaskTypes,
  filterTasksByVisibleProjects,
} from "./view";
import type { Project, Task } from "@/lib/types";

/** Build a Task with just the fields the view filter cares about. */
function task(id: string, projectId: string, taskTypeId = "t"): Task {
  return {
    id,
    projectId,
    taskTypeId,
    title: id,
    startDate: "2026-05-21",
    endDate: "2026-05-21",
    createdAt: 0,
    updatedAt: 0,
  };
}

/** Build a Project with just the fields the visibility filter cares about. */
function project(id: string, visible: boolean): Project {
  return {
    id,
    name: id,
    color: "#3175B9",
    visible,
    order: 0,
    createdAt: 0,
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

describe("filterTasksByVisibleProjects (US-014 visibility toggle)", () => {
  const a1 = task("a1", "A");
  const a2 = task("a2", "A");
  const b1 = task("b1", "B");
  const c1 = task("c1", "C");
  const tasks = [a1, b1, a2, c1];

  it("returns the input unchanged when every project is visible", () => {
    const projects = [project("A", true), project("B", true), project("C", true)];
    expect(filterTasksByVisibleProjects(tasks, projects)).toBe(tasks);
  });

  it("drops tasks whose project is toggled off", () => {
    const projects = [project("A", false), project("B", true), project("C", true)];
    expect(filterTasksByVisibleProjects(tasks, projects)).toEqual([b1, c1]);
  });

  it("drops every task when all projects are hidden", () => {
    const projects = [project("A", false), project("B", false), project("C", false)];
    expect(filterTasksByVisibleProjects(tasks, projects)).toEqual([]);
  });

  it("preserves original order within the visible set", () => {
    const projects = [project("A", true), project("B", false), project("C", true)];
    expect(filterTasksByVisibleProjects(tasks, projects).map((t) => t.id)).toEqual([
      "a1",
      "a2",
      "c1",
    ]);
  });

  it("keeps a task whose project is missing from the list (defensive)", () => {
    const projects = [project("A", false)];
    // b1/c1 have no matching project entry, so they are not in the hidden set.
    expect(filterTasksByVisibleProjects(tasks, projects)).toEqual([b1, c1]);
  });

  it("empty task list yields an empty list", () => {
    expect(filterTasksByVisibleProjects([], [project("A", false)])).toEqual([]);
  });
});

describe("filterTasksByTaskTypes (US-015 task-type filter)", () => {
  const a = task("a", "P", "deadline");
  const b = task("b", "P", "work");
  const c = task("c", "P", "meeting");
  const d = task("d", "P", "deadline");
  const tasks = [a, b, c, d];

  it("returns the input unchanged when nothing is hidden", () => {
    expect(filterTasksByTaskTypes(tasks, new Set())).toBe(tasks);
  });

  it("drops tasks whose task type is toggled off", () => {
    expect(filterTasksByTaskTypes(tasks, new Set(["work"]))).toEqual([a, c, d]);
  });

  it("drops every matching type (multiple hidden)", () => {
    expect(filterTasksByTaskTypes(tasks, new Set(["deadline", "meeting"]))).toEqual([
      b,
    ]);
  });

  it("hiding every type yields an empty list", () => {
    expect(
      filterTasksByTaskTypes(tasks, new Set(["deadline", "work", "meeting"])),
    ).toEqual([]);
  });

  it("preserves original order within the visible set", () => {
    expect(
      filterTasksByTaskTypes(tasks, new Set(["meeting"])).map((t) => t.id),
    ).toEqual(["a", "b", "d"]);
  });

  it("an unknown hidden id removes nothing", () => {
    expect(filterTasksByTaskTypes(tasks, new Set(["missing"]))).toEqual(tasks);
  });

  it("empty task list yields an empty list", () => {
    expect(filterTasksByTaskTypes([], new Set(["work"]))).toEqual([]);
  });

  it("composes (AND) with the project filter", () => {
    // Two projects, mixed types; keep project A AND hide the 'work' type.
    const a1 = task("a1", "A", "work");
    const a2 = task("a2", "A", "deadline");
    const b1 = task("b1", "B", "deadline");
    const all = [a1, a2, b1];
    const byProject = filterTasksByProject(all, "A"); // -> [a1, a2]
    expect(filterTasksByTaskTypes(byProject, new Set(["work"]))).toEqual([a2]);
  });
});
