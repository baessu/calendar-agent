import { describe, expect, it } from "vitest";
import { groupMarkersByDate } from "./markers";
import type { Marker, MarkerKind } from "@/lib/types";

/** Build a Marker with just the fields grouping cares about. */
function marker(id: string, date: string, kind: MarkerKind, createdAt = 0): Marker {
  return { id, kind, label: id, date, createdAt };
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
