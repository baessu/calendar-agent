/**
 * Date utilities for the calendar.
 *
 * Dates are stored/compared as "YYYY-MM-DD" strings. To avoid timezone/DST
 * drift we anchor every date at UTC noon when doing arithmetic — noon is far
 * from any DST boundary, so adding whole days never lands on the wrong date.
 */
import type { DateString } from "@/lib/types";

const DAY_MS = 86_400_000;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Parse "YYYY-MM-DD" into an epoch-ms timestamp anchored at UTC noon. */
export function parseDate(date: DateString): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d, 12);
}

/** Format a UTC-noon timestamp back to a "YYYY-MM-DD" string. */
export function toDateString(ts: number): DateString {
  const dt = new Date(ts);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** Shift a UTC-noon timestamp by `n` whole days (n may be negative). */
export function addDays(ts: number, n: number): number {
  return ts + n * DAY_MS;
}

/** Whole-day difference `b - a` (both UTC-noon timestamps). */
export function diffDays(a: number, b: number): number {
  return Math.round((b - a) / DAY_MS);
}

/** Today's local calendar date as "YYYY-MM-DD". */
export function todayDateString(now: Date = new Date()): DateString {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}
