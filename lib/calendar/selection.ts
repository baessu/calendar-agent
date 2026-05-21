/**
 * Drag-selection range helpers (pure logic, unit-tested) — US-004.
 *
 * A drag across day cells produces two endpoint dates (anchor + current). These
 * helpers normalize that pair into an ordered {start, end}, test cell membership
 * for the highlight, and format the human label shown in the creation popover.
 * All comparisons go through the UTC-noon parser so there is no timezone drift.
 */
import type { DateString } from "@/lib/types";
import { parseDate } from "./dates";

/** An ordered, inclusive date range (start <= end). */
export interface DateRange {
  start: DateString;
  end: DateString;
}

/** Order two endpoint dates so `start` is the earlier one (handles reverse drag). */
export function normalizeRange(a: DateString, b: DateString): DateRange {
  return parseDate(a) <= parseDate(b) ? { start: a, end: b } : { start: b, end: a };
}

/** Whether `date` falls inside [start, end], inclusive of both ends. */
export function isWithinRange(date: DateString, start: DateString, end: DateString): boolean {
  const t = parseDate(date);
  return t >= parseDate(start) && t <= parseDate(end);
}

/** "M/D" with no leading zeros, e.g. "2026-05-21" -> "5/21". */
function shortLabel(date: DateString): string {
  const parts = date.split("-");
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

/**
 * Human label for the selected span, shown in the creation popover.
 * Single day -> "5/21"; multi-day -> "5/21 ~ 5/24".
 */
export function formatRangeLabel(start: DateString, end: DateString): string {
  return start === end ? shortLabel(start) : `${shortLabel(start)} ~ ${shortLabel(end)}`;
}
