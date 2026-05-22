/**
 * Bar edge-resize math (pure logic, unit-tested) — US-016.
 *
 * Dragging a bar's left edge changes the start date; dragging the right edge
 * changes the end date. The moving edge is clamped so the start can never pass
 * the end — a task is always at least one inclusive day (AC2). All comparison
 * goes through the UTC-noon parser, matching the rest of the calendar, so there
 * is no timezone drift and week/month boundaries are irrelevant.
 */
import type { DateString } from "@/lib/types";
import { parseDate } from "./dates";
import type { DateRange } from "./selection";

/** Which edge of a bar is being dragged. */
export type ResizeEdge = "start" | "end";

/**
 * Resize [start..end] by moving one edge to `date`. The start edge is clamped to
 * at most `end`, and the end edge to at least `start`, so `start <= end` always
 * holds (AC2). Returns an equivalent range when the edge lands on its current
 * date (the caller can skip the write).
 */
export function resizeRange(
  start: DateString,
  end: DateString,
  edge: ResizeEdge,
  date: DateString,
): DateRange {
  if (edge === "start") {
    // New start can't move past the end; clamp to a single-day task.
    const newStart = parseDate(date) <= parseDate(end) ? date : end;
    return { start: newStart, end };
  }
  // New end can't move before the start; clamp to a single-day task.
  const newEnd = parseDate(date) >= parseDate(start) ? date : start;
  return { start, end: newEnd };
}
