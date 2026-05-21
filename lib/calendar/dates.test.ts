import { describe, expect, it } from "vitest";
import { addDays, diffDays, parseDate, toDateString, todayDateString } from "./dates";

describe("dates", () => {
  it("round-trips parseDate <-> toDateString", () => {
    expect(toDateString(parseDate("2026-05-21"))).toBe("2026-05-21");
    expect(toDateString(parseDate("2026-01-01"))).toBe("2026-01-01");
    expect(toDateString(parseDate("2026-12-31"))).toBe("2026-12-31");
  });

  it("addDays crosses month and year boundaries", () => {
    expect(toDateString(addDays(parseDate("2026-05-21"), 3))).toBe("2026-05-24");
    expect(toDateString(addDays(parseDate("2026-04-30"), 1))).toBe("2026-05-01");
    expect(toDateString(addDays(parseDate("2026-12-31"), 1))).toBe("2027-01-01");
    expect(toDateString(addDays(parseDate("2026-05-01"), -1))).toBe("2026-04-30");
  });

  it("diffDays returns whole-day difference b - a", () => {
    expect(diffDays(parseDate("2026-05-21"), parseDate("2026-05-24"))).toBe(3);
    expect(diffDays(parseDate("2026-05-24"), parseDate("2026-05-21"))).toBe(-3);
    expect(diffDays(parseDate("2026-05-21"), parseDate("2026-05-21"))).toBe(0);
  });

  it("todayDateString formats a given Date as YYYY-MM-DD (local)", () => {
    expect(todayDateString(new Date(2026, 4, 21))).toBe("2026-05-21");
    expect(todayDateString(new Date(2026, 0, 9))).toBe("2026-01-09");
  });
});
