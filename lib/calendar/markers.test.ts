import { describe, expect, it } from "vitest";
import { groupMarkersByDate, planMarkerScopeMigration } from "./markers";
import type { Marker, MarkerKind } from "@/lib/types";

/** Build a Marker with just the fields grouping cares about. */
function marker(id: string, date: string, kind: MarkerKind, createdAt = 0): Marker {
  return { id, kind, label: id, date, projectId: "p", createdAt };
}

describe("groupMarkersByDate", () => {
  it("returns an empty map for no markers", () => {
    expect(groupMarkersByDate([]).size).toBe(0);
  });

  it("buckets a single marker under its date", () => {
    const map = groupMarkersByDate([marker("a", "2026-05-21", "event")]);
    expect(map.get("2026-05-21")).toHaveLength(1);
    expect(map.get("2026-05-21")![0].id).toBe("a");
  });

  it("groups multiple dates separately", () => {
    const map = groupMarkersByDate([
      marker("a", "2026-05-21", "event"),
      marker("b", "2026-05-22", "deadline"),
    ]);
    expect(map.size).toBe(2);
    expect(map.get("2026-05-21")).toHaveLength(1);
    expect(map.get("2026-05-22")).toHaveLength(1);
  });

  it("sorts deadlines before events within a date", () => {
    const map = groupMarkersByDate([
      marker("ev", "2026-05-21", "event", 10),
      marker("dl", "2026-05-21", "deadline", 20),
    ]);
    expect(map.get("2026-05-21")!.map((m) => m.id)).toEqual(["dl", "ev"]);
  });

  it("breaks same-kind ties by createdAt ascending", () => {
    const map = groupMarkersByDate([
      marker("late", "2026-05-21", "event", 200),
      marker("early", "2026-05-21", "event", 100),
    ]);
    expect(map.get("2026-05-21")!.map((m) => m.id)).toEqual(["early", "late"]);
  });
});

describe("planMarkerScopeMigration (US-021 markers per project)", () => {
  it("returns no relinks for an empty list", () => {
    expect(planMarkerScopeMigration([], "def")).toEqual([]);
  });

  it("assigns the default project to markers missing a projectId", () => {
    const markers = [
      { id: "a" }, // legacy marker, no projectId
      { id: "b", projectId: undefined },
      { id: "c", projectId: "" }, // empty counts as unset
    ];
    expect(planMarkerScopeMigration(markers, "def")).toEqual([
      { id: "a", projectId: "def" },
      { id: "b", projectId: "def" },
      { id: "c", projectId: "def" },
    ]);
  });

  it("leaves markers that already have a project untouched", () => {
    const markers = [
      { id: "a", projectId: "p1" },
      { id: "b" },
      { id: "c", projectId: "p2" },
    ];
    // Only the marker without a project is relinked.
    expect(planMarkerScopeMigration(markers, "def")).toEqual([
      { id: "b", projectId: "def" },
    ]);
  });

  it("returns no relinks when every marker already has a project", () => {
    const markers = [
      { id: "a", projectId: "p1" },
      { id: "b", projectId: "p2" },
    ];
    expect(planMarkerScopeMigration(markers, "def")).toEqual([]);
  });
});
