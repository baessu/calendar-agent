/**
 * Infinite-scroll month grouping (pure logic, unit-tested).
 *
 * The calendar is a single continuous run of Sun..Sat weeks. Weeks are grouped
 * into months by the rule "a week belongs to the month of its Thursday" (index 4),
 * which is the ISO convention and keeps each month visually self-contained.
 */
import type { DateString } from "@/lib/types";
import { addDays, toDateString, todayDateString } from "./dates";

/** Korean weekday labels, Sunday-first. */
export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** A single day cell in the grid. */
export interface CalendarDay {
  /** UTC-noon timestamp. */
  ts: number;
  /** "YYYY-MM-DD". */
  date: DateString;
  /** Day of month, 1..31. */
  day: number;
  /** 0-based month (0 = January). */
  month: number;
  year: number;
  /** 0 = Sunday .. 6 = Saturday. */
  weekday: number;
  isToday: boolean;
}

/** A week is exactly 7 days, Sunday..Saturday. */
export type CalendarWeek = CalendarDay[];

/** A run of weeks that belong to the same owning month. */
export interface MonthGroup {
  /** "YYYY-M" with a 1-based month (used as a stable DOM/data key). */
  key: string;
  year: number;
  /** 0-based month. */
  month: number;
  weeks: CalendarWeek[];
}

/** A 1-based {year, month} pair (month: 1 = January .. 12 = December). */
export interface YearMonth {
  year: number;
  month: number;
}

/** Add `delta` months to a 1-based {year, month}, wrapping years correctly. */
export function addMonths(ym: YearMonth, delta: number): YearMonth {
  const idx = ym.year * 12 + (ym.month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

/**
 * Build the continuous list of Sun..Sat weeks that covers
 * [from 1st .. to last day], grid-aligned so the first day is a Sunday and
 * the last day is a Saturday.
 */
export function buildWeeksRange(
  from: YearMonth,
  to: YearMonth,
  today: DateString = todayDateString(),
): CalendarWeek[] {
  const first = Date.UTC(from.year, from.month - 1, 1, 12);
  const gridStart = addDays(first, -new Date(first).getUTCDay());
  // Day 0 of the month after `to` == last calendar day of `to`.
  const lastDay = Date.UTC(to.year, to.month, 0, 12);
  const gridEnd = addDays(lastDay, 6 - new Date(lastDay).getUTCDay());

  const weeks: CalendarWeek[] = [];
  for (let ts = gridStart; ts <= gridEnd; ts = addDays(ts, 7)) {
    const days: CalendarDay[] = [];
    for (let i = 0; i < 7; i++) {
      const t = addDays(ts, i);
      const dt = new Date(t);
      const date = toDateString(t);
      days.push({
        ts: t,
        date,
        day: dt.getUTCDate(),
        month: dt.getUTCMonth(),
        year: dt.getUTCFullYear(),
        weekday: dt.getUTCDay(),
        isToday: date === today,
      });
    }
    weeks.push(days);
  }
  return weeks;
}

/** Group weeks into months by the Thursday rule (week[4]). */
export function groupWeeksByMonth(weeks: CalendarWeek[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const week of weeks) {
    const thursday = week[4];
    const key = `${thursday.year}-${thursday.month + 1}`;
    const last = groups[groups.length - 1];
    if (!last || last.key !== key) {
      groups.push({ key, year: thursday.year, month: thursday.month, weeks: [week] });
    } else {
      last.weeks.push(week);
    }
  }
  return groups;
}

/** "YYYY년 M월" header label (month0 is 0-based). */
export function monthLabel(year: number, month0: number): string {
  return `${year}년 ${month0 + 1}월`;
}
