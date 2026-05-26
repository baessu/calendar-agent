import { describe, expect, it } from "vitest";
import type { Task } from "@/lib/types";
import { hasNote, tasksWithNotesInRange } from "./notes";

/** Minimal task factory (only the fields these helpers read matter). */
function task(over: Partial<Task>): Task {
  return {
    id: over.id ?? "t",
    projectId: "p",
    taskTypeId: "tt",
    title: over.title ?? "T",
    startDate: over.startDate ?? "2026-05-10",
    endDate: over.endDate ?? "2026-05-10",
    note: over.note,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("hasNote", () => {
  it("is false for an absent note", () => {
    expect(hasNote(task({}))).toBe(false);
  });

  it("is false for an empty or whitespace-only note", () => {
    expect(hasNote(task({ note: "" }))).toBe(false);
    expect(hasNote(task({ note: "   \n\t" }))).toBe(false);
  });

  it("is true for a non-empty note", () => {
    expect(hasNote(task({ note: "검토 필요" }))).toBe(true);
  });
});

describe("tasksWithNotesInRange", () => {
  const a = task({ id: "a", title: "A", startDate: "2026-05-05", endDate: "2026-05-06", note: "n" });
  const b = task({ id: "b", title: "B", startDate: "2026-05-10", endDate: "2026-05-12", note: "n" });
  const noNote = task({ id: "x", title: "X", startDate: "2026-05-11", endDate: "2026-05-11" });
  const after = task({ id: "z", title: "Z", startDate: "2026-06-01", endDate: "2026-06-02", note: "n" });

  it("drops tasks without a note", () => {
    expect(
      tasksWithNotesInRange([noNote], "2026-05-01", "2026-05-31").length,
    ).toBe(0);
  });

  it("drops noted tasks fully outside the range", () => {
    expect(
      tasksWithNotesInRange([after], "2026-05-01", "2026-05-31").length,
    ).toBe(0);
  });

  it("keeps a task that ends exactly on the range start (inclusive overlap)", () => {
    const edge = task({ id: "e", startDate: "2026-04-28", endDate: "2026-05-01", note: "n" });
    expect(
      tasksWithNotesInRange([edge], "2026-05-01", "2026-05-31").map((t) => t.id),
    ).toEqual(["e"]);
  });

  it("keeps a task that starts exactly on the range end (inclusive overlap)", () => {
    const edge = task({ id: "e", startDate: "2026-05-31", endDate: "2026-06-03", note: "n" });
    expect(
      tasksWithNotesInRange([edge], "2026-05-01", "2026-05-31").map((t) => t.id),
    ).toEqual(["e"]);
  });

  it("returns overlapping noted tasks sorted by start date then title", () => {
    expect(
      tasksWithNotesInRange([b, noNote, a, after], "2026-05-01", "2026-05-31").map(
        (t) => t.id,
      ),
    ).toEqual(["a", "b"]);
  });

  it("breaks start-date ties by title", () => {
    const t2 = task({ id: "2", title: "Z", startDate: "2026-05-10", endDate: "2026-05-10", note: "n" });
    const t1 = task({ id: "1", title: "A", startDate: "2026-05-10", endDate: "2026-05-10", note: "n" });
    expect(
      tasksWithNotesInRange([t2, t1], "2026-05-01", "2026-05-31").map((t) => t.title),
    ).toEqual(["A", "Z"]);
  });
});
