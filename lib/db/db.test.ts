import { describe, it, expect } from "vitest";
import { db, CalendarDB } from "./index";

describe("CalendarDB scaffold", () => {
  it("exposes a Dexie instance named CalendarDB", () => {
    expect(db).toBeInstanceOf(CalendarDB);
    expect(db.name).toBe("CalendarDB");
  });
});
