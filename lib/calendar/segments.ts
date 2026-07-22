/**
 * Week-boundary task splitting (pure logic, unit-tested) — US-005.
 *
 * A task spans startDate..endDate inclusive. To draw it as horizontal bars on a
 * Sun..Sat grid, each task is clipped to the part that intersects a given week,
 * yielding a segment with column indices (0=Sun .. 6=Sat) plus flags for whether
 * the task continues past either edge (so the bar can square off that corner).
 *
 * Lane stacking (placing overlapping segments on separate rows) is US-007's
 * `layout.ts`; here we only clip + order.
 */
import type { DateString, Task } from "@/lib/types";
import type { CalendarWeek } from "./infinite";
import { diffDays, parseDate } from "./dates";

/** Anything drawable as a week bar — it just needs an inclusive date span. */
export interface HasSpan {
  startDate: DateString;
  endDate: DateString;
}

/**
 * A spanning item clipped to one week, ready to render as a bar. Generic over
 * the payload so both tasks (default) and project periods reuse the same
 * clipping + lane-stacking pipeline; `.task` holds whatever was clipped.
 */
export interface WeekSegment<T extends HasSpan = Task> {
  task: T;
  /** First column the bar covers, 0 (Sun) .. 6 (Sat). */
  startCol: number;
  /** Last column the bar covers, 0 (Sun) .. 6 (Sat). */
  endCol: number;
  /** Item started before this week (bar continues from the left). */
  contL: boolean;
  /** Item ends after this week (bar continues to the right). */
  contR: boolean;
}

/**
 * Clip `items` to `week`, returning a segment per item that intersects it.
 * Segments are ordered by start column, longer spans first on ties — a stable
 * order for naive lane stacking.
 */
export function weekSegments<T extends HasSpan = Task>(
  week: CalendarWeek,
  items: T[],
): WeekSegment<T>[] {
  const wStart = week[0].ts;
  const wEnd = week[6].ts;
  const segs: WeekSegment<T>[] = [];

  for (const task of items) {
    const ts0 = parseDate(task.startDate);
    const ts1 = parseDate(task.endDate);
    // No intersection with this week.
    if (ts1 < wStart || ts0 > wEnd) continue;
    segs.push({
      task,
      startCol: Math.max(0, diffDays(wStart, ts0)),
      endCol: Math.min(6, diffDays(wStart, ts1)),
      contL: ts0 < wStart,
      contR: ts1 > wEnd,
    });
  }

  segs.sort(
    (a, b) =>
      a.startCol - b.startCol || (b.endCol - b.startCol) - (a.endCol - a.startCol),
  );
  return segs;
}
