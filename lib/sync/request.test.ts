import { describe, expect, it } from "vitest";
import { MAX_ROWS_PER_TABLE, parseSyncStateRequest } from "./request";

/** A minimal well-formed body. */
function body(over: Record<string, unknown> = {}) {
  return {
    projects: [],
    taskTypes: [],
    tasks: [],
    markers: [],
    deletions: [],
    ...over,
  };
}

describe("parseSyncStateRequest", () => {
  it("accepts a well-formed empty body", () => {
    expect(parseSyncStateRequest(body())).toEqual({
      projects: [],
      taskTypes: [],
      tasks: [],
      markers: [],
      deletions: [],
    });
  });

  it.each([null, undefined, 42, "nope", []])("rejects non-object body: %s", (v) => {
    expect(parseSyncStateRequest(v)).toBeNull();
  });

  it("rejects a body with a missing table rather than defaulting it to empty", () => {
    // A truncated request must not read as "delete everything on the other device".
    const withoutTasks: Record<string, unknown> = body();
    delete withoutTasks.tasks;
    expect(parseSyncStateRequest(withoutTasks)).toBeNull();
  });

  it("rejects a table that is not an array", () => {
    expect(parseSyncStateRequest(body({ tasks: { id: "x" } }))).toBeNull();
  });

  it("rejects missing deletions", () => {
    const withoutDeletions: Record<string, unknown> = body();
    delete withoutDeletions.deletions;
    expect(parseSyncStateRequest(withoutDeletions)).toBeNull();
  });

  it("preserves unknown fields on a row (server is not the schema authority)", () => {
    const row = { id: "t1", updatedAt: 5, title: "hi", futureField: true };
    const parsed = parseSyncStateRequest(body({ tasks: [row] }));
    expect(parsed?.tasks).toEqual([row]);
  });

  it.each([
    ["missing id", { updatedAt: 1 }],
    ["empty id", { id: "", updatedAt: 1 }],
    ["non-string id", { id: 7, updatedAt: 1 }],
    ["missing updatedAt", { id: "a" }],
    ["non-numeric updatedAt", { id: "a", updatedAt: "1" }],
    ["NaN updatedAt", { id: "a", updatedAt: NaN }],
    ["Infinity updatedAt", { id: "a", updatedAt: Infinity }],
    ["null row", null],
    ["array row", []],
  ])("drops a malformed row (%s) without failing the whole sync", (_label, row) => {
    const good = { id: "keep", updatedAt: 1 };
    const parsed = parseSyncStateRequest(body({ tasks: [row, good] }));
    expect(parsed?.tasks).toEqual([good]);
  });

  it.each([
    ["unknown table", { id: "a", table: "secrets", deletedAt: 1 }],
    ["missing table", { id: "a", deletedAt: 1 }],
    ["missing deletedAt", { id: "a", table: "tasks" }],
    ["non-numeric deletedAt", { id: "a", table: "tasks", deletedAt: "1" }],
    ["empty id", { id: "", table: "tasks", deletedAt: 1 }],
  ])("drops a malformed tombstone (%s)", (_label, t) => {
    const good = { id: "keep", table: "tasks" as const, deletedAt: 1 };
    const parsed = parseSyncStateRequest(body({ deletions: [t, good] }));
    expect(parsed?.deletions).toEqual([good]);
  });

  it("rejects a table exceeding the row ceiling", () => {
    const rows = Array.from({ length: MAX_ROWS_PER_TABLE + 1 }, (_, i) => ({
      id: `t${i}`,
      updatedAt: 0,
    }));
    expect(parseSyncStateRequest(body({ tasks: rows }))).toBeNull();
  });

  it("accepts a table exactly at the row ceiling", () => {
    const rows = Array.from({ length: MAX_ROWS_PER_TABLE }, (_, i) => ({
      id: `t${i}`,
      updatedAt: 0,
    }));
    expect(parseSyncStateRequest(body({ tasks: rows }))?.tasks).toHaveLength(
      MAX_ROWS_PER_TABLE,
    );
  });
});
