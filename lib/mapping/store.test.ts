import { beforeEach, describe, expect, it } from "vitest";
import { readMap, writeMap } from "./store";

beforeEach(() => window.localStorage.clear());

describe("task-board map store", () => {
  it("round-trips a map", () => {
    writeMap({ t1: ["b1", "b2"], t2: ["b3"] });
    expect(readMap()).toEqual({ t1: ["b1", "b2"], t2: ["b3"] });
  });

  it("prunes empty entries on write", () => {
    writeMap({ t1: ["b1"], t2: [] });
    expect(readMap()).toEqual({ t1: ["b1"] });
  });

  it("returns {} for missing / garbage storage", () => {
    expect(readMap()).toEqual({});
    window.localStorage.setItem("task-board-map-v1", "not json{");
    expect(readMap()).toEqual({});
  });

  it("drops non-string ids and non-array values", () => {
    window.localStorage.setItem(
      "task-board-map-v1",
      JSON.stringify({ t1: ["ok", 5, null], t2: "nope" }),
    );
    expect(readMap()).toEqual({ t1: ["ok"] });
  });
});
