import { describe, expect, it } from "vitest";
import { buildWeeksRange, type CalendarWeek } from "./infinite";
import { addDays, parseDate, toDateString } from "./dates";
import { weekSegments } from "./segments";
import type { Task } from "@/lib/types";

const TODAY = "2026-05-21";

// The Sun..Sat week containing today (2026-05-21).
const WEEK: CalendarWeek = buildWeeksRange(
  { year: 2026, month: 5 },
  { year: 2026, month: 5 },
  TODAY,
).find((w) => w.some((d) => d.date === TODAY))!;

const SUN = WEEK[0].date; // col 0
const dayBefore = (n: number) => toDateString(addDays(WEEK[0].ts, -n));
const dayAfter = (n: number) => toDateString(addDays(WEEK[6].ts, n));

/** Build a Task with just the fields weekSegments cares about. */
function task(id: string, startDate: string, endDate: string): Task {
  return {
    id,
    projectId: "p",
    taskTypeId: "t",
    title: id,
    startDate,
    endDate,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("weekSegments", () => {
  it("clips a multi-day task inside the week to its columns", () => {
    const segs = weekSegments(WEEK, [task("a", WEEK[1].date, WEEK[3].date)]);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ startCol: 1, endCol: 3, contL: false, contR: false });
  });

  it("treats a single-day task as startCol === endCol", () => {
    const segs = weekSegments(WEEK, [task("a", TODAY, TODAY)]);
    const col = parseDate(TODAY) >= WEEK[0].ts ? (parseDate(TODAY) - WEEK[0].ts) / 86_400_000 : 0;
    expect(segs[0].startCol).toBe(segs[0].endCol);
    expect(segs[0].startCol).toBe(col);
  });

  it("flags continuation to the right and clamps endCol to Saturday", () => {
    const segs = weekSegments(WEEK, [task("a", WEEK[5].date, dayAfter(3))]);
    expect(segs[0]).toMatchObject({ startCol: 5, endCol: 6, contL: false, contR: true });
  });

  it("flags continuation from the left and clamps startCol to Sunday", () => {
    const segs = weekSegments(WEEK, [task("a", dayBefore(3), WEEK[1].date)]);
    expect(segs[0]).toMatchObject({ startCol: 0, endCol: 1, contL: true, contR: false });
  });

  it("covers the whole week when the task spans past both edges", () => {
    const segs = weekSegments(WEEK, [task("a", dayBefore(5), dayAfter(5))]);
    expect(segs[0]).toMatchObject({ startCol: 0, endCol: 6, contL: true, contR: true });
  });

  it("excludes tasks that do not intersect the week", () => {
    const before = task("before", dayBefore(10), dayBefore(8));
    const after = task("after", dayAfter(8), dayAfter(10));
    expect(weekSegments(WEEK, [before, after])).toHaveLength(0);
  });

  it("orders segments by start column, then longer span first", () => {
    const short = task("short", WEEK[1].date, WEEK[1].date); // col 1, len 1
    const long = task("long", WEEK[1].date, WEEK[4].date); // col 1, len 4
    const late = task("late", WEEK[3].date, WEEK[5].date); // col 3
    const segs = weekSegments(WEEK, [short, late, long]);
    expect(segs.map((s) => s.task.id)).toEqual(["long", "short", "late"]);
  });

  it("ignores SUN-only sanity: Sunday task lands in column 0", () => {
    const segs = weekSegments(WEEK, [task("a", SUN, SUN)]);
    expect(segs[0]).toMatchObject({ startCol: 0, endCol: 0 });
  });
});
