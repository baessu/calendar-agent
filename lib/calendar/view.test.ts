import { describe, expect, it } from "vitest";
import { filterTasksByProject, filterTasksByVisibleProjects } from "./view";
import type { Project, Task } from "@/lib/types";

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
