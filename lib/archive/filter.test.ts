import { describe, expect, it } from "vitest";
import { activeOnly, archivedOnly, isArchived } from "./filter";

const row = (id: string, archivedAt?: number) => ({ id, archivedAt });

describe("isArchived", () => {
  it("treats absent or 0 archivedAt as active", () => {
    expect(isArchived(row("a"))).toBe(false);
    expect(isArchived(row("a", 0))).toBe(false);
  });
  it("treats a positive timestamp as archived", () => {
    expect(isArchived(row("a", 123))).toBe(true);
  });
});

describe("activeOnly", () => {
  it("keeps only non-archived rows, order preserved", () => {
    const rows = [row("a"), row("b", 100), row("c", 0), row("d", 200)];
    expect(activeOnly(rows).map((r) => r.id)).toEqual(["a", "c"]);
  });
});

describe("archivedOnly", () => {
  it("keeps only archived rows, most recent first", () => {
    const rows = [row("a"), row("old", 100), row("new", 300), row("mid", 200)];
    expect(archivedOnly(rows).map((r) => r.id)).toEqual(["new", "mid", "old"]);
  });
  it("does not mutate the input", () => {
    const rows = [row("b", 200), row("a", 100)];
    const copy = [...rows];
    archivedOnly(rows);
    expect(rows).toEqual(copy);
  });
});
