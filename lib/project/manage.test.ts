import { describe, expect, it } from "vitest";
import { PROJECT_COLORS } from "@/lib/color/tokens";
import type { Project } from "@/lib/types";
import {
  defaultProjectId,
  isDefaultProject,
  nextProjectOrder,
  unusedProjectColor,
} from "./manage";

/** Build a Project with only the fields a given test cares about. */
function project(p: Partial<Project> & { id: string }): Project {
  return {
    name: p.id,
    color: "#3175B9",
    visible: true,
    order: 0,
    createdAt: 0,
    ...p,
  };
}

describe("defaultProjectId", () => {
  it("returns null for no projects", () => {
    expect(defaultProjectId([])).toBeNull();
  });

  it("picks the earliest-created project", () => {
    const ps = [
      project({ id: "b", createdAt: 200 }),
      project({ id: "a", createdAt: 100 }),
      project({ id: "c", createdAt: 300 }),
    ];
    expect(defaultProjectId(ps)).toBe("a");
  });

  it("breaks createdAt ties by smallest id", () => {
    const ps = [
      project({ id: "z", createdAt: 100 }),
      project({ id: "m", createdAt: 100 }),
    ];
    expect(defaultProjectId(ps)).toBe("m");
  });

  it("isDefaultProject reflects the chosen default", () => {
    const ps = [project({ id: "a", createdAt: 100 }), project({ id: "b", createdAt: 200 })];
    expect(isDefaultProject("a", ps)).toBe(true);
    expect(isDefaultProject("b", ps)).toBe(false);
  });
});

describe("unusedProjectColor", () => {
  it("recommends the first hue when no projects exist", () => {
    expect(unusedProjectColor([])).toBe(PROJECT_COLORS[0].color);
  });

  it("skips colors already in use", () => {
    const used = [{ color: PROJECT_COLORS[0].color }, { color: PROJECT_COLORS[1].color }];
    expect(unusedProjectColor(used)).toBe(PROJECT_COLORS[2].color);
  });

  it("is case-insensitive when matching used colors", () => {
    const used = [{ color: PROJECT_COLORS[0].color.toLowerCase() }];
    expect(unusedProjectColor(used)).toBe(PROJECT_COLORS[1].color);
  });

  it("falls back to the first hue once all are used", () => {
    const used = PROJECT_COLORS.map((c) => ({ color: c.color }));
    expect(unusedProjectColor(used)).toBe(PROJECT_COLORS[0].color);
  });
});

describe("nextProjectOrder", () => {
  it("is 0 when there are no projects", () => {
    expect(nextProjectOrder([])).toBe(0);
  });

  it("is one past the current max order", () => {
    expect(nextProjectOrder([{ order: 0 }, { order: 2 }, { order: 1 }])).toBe(3);
  });
});
