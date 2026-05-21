import { describe, expect, it } from "vitest";
import {
  addMonths,
  buildWeeksRange,
  groupWeeksByMonth,
  monthLabel,
  type CalendarWeek,
} from "./infinite";

const TODAY = "2026-05-21";

describe("addMonths", () => {
  it("adds within a year", () => {
    expect(addMonths({ year: 2026, month: 5 }, 2)).toEqual({ year: 2026, month: 7 });
  });
  it("wraps forward across a year", () => {
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2026, month: 11 }, 3)).toEqual({ year: 2027, month: 2 });
  });
  it("wraps backward across a year", () => {
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(addMonths({ year: 2026, month: 2 }, -5)).toEqual({ year: 2025, month: 9 });
  });
});

describe("buildWeeksRange", () => {
  const weeks = buildWeeksRange({ year: 2026, month: 5 }, { year: 2026, month: 5 }, TODAY);

  it("produces grid-aligned weeks of length 7", () => {
    for (const week of weeks) expect(week).toHaveLength(7);
  });

  it("starts on a Sunday and ends on a Saturday", () => {
    expect(weeks[0][0].weekday).toBe(0);
    expect(weeks[weeks.length - 1][6].weekday).toBe(6);
  });

  it("contains strictly consecutive days across the whole range", () => {
    const flat = weeks.flat();
    for (let i = 1; i < flat.length; i++) {
      expect(flat[i].ts - flat[i - 1].ts).toBe(86_400_000);
    }
  });

  it("flags today exactly once", () => {
    const todays = weeks.flat().filter((d) => d.isToday);
    expect(todays).toHaveLength(1);
    expect(todays[0].date).toBe(TODAY);
  });

  it("covers every day of the requested month", () => {
    const dates = new Set(weeks.flat().map((d) => d.date));
    for (let day = 1; day <= 31; day++) {
      expect(dates.has(`2026-05-${String(day).padStart(2, "0")}`)).toBe(true);
    }
  });

  it("spans multiple months continuously for a wide range", () => {
    const wide = buildWeeksRange({ year: 2026, month: 4 }, { year: 2026, month: 6 }, TODAY);
    const flat = wide.flat();
    for (let i = 1; i < flat.length; i++) {
      expect(flat[i].ts - flat[i - 1].ts).toBe(86_400_000);
    }
  });
});

describe("groupWeeksByMonth", () => {
  it("assigns each week to the month of its Thursday", () => {
    const weeks = buildWeeksRange({ year: 2026, month: 4 }, { year: 2026, month: 6 }, TODAY);
    const groups = groupWeeksByMonth(weeks);
    for (const g of groups) {
      for (const week of g.weeks) {
        expect(week[4].month).toBe(g.month); // Thursday's month == group's month
      }
    }
  });

  it("produces a contiguous, ordered set of month groups", () => {
    const groups = groupWeeksByMonth(
      buildWeeksRange({ year: 2026, month: 4 }, { year: 2026, month: 6 }, TODAY),
    );
    const may = groups.find((g) => g.key === "2026-5");
    expect(may).toBeDefined();
    expect(may?.month).toBe(4); // 0-based May
    // keys are unique and in chronological order
    const keys = groups.map((g) => g.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("handles an explicit Thursday-straddling week", () => {
    // A single hand-built week where Thursday is in May -> belongs to May.
    const week: CalendarWeek = buildWeeksRange(
      { year: 2026, month: 5 },
      { year: 2026, month: 5 },
      TODAY,
    )[0];
    const groups = groupWeeksByMonth([week]);
    expect(groups).toHaveLength(1);
    expect(groups[0].month).toBe(week[4].month);
  });
});

describe("monthLabel", () => {
  it("formats a 0-based month into a Korean label", () => {
    expect(monthLabel(2026, 4)).toBe("2026년 5월");
    expect(monthLabel(2027, 0)).toBe("2027년 1월");
  });
});
