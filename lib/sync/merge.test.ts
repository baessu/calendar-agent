import { describe, expect, it } from "vitest";
import {
  countRows,
  gcTombstones,
  mergeRows,
  mergeStates,
  mergeTombstones,
} from "./merge";
import {
  TOMBSTONE_TTL_MS,
  emptySyncState,
  type SyncState,
  type Tombstone,
} from "./types";

/** Minimal syncable row for the generic helpers. */
const row = (id: string, updatedAt: number) => ({ id, updatedAt });

/** A SyncState carrying only tasks + deletions (the interesting axes). */
function state(
  tasks: { id: string; updatedAt: number }[],
  deletions: Tombstone[] = [],
): SyncState {
  return {
    ...emptySyncState(),
    // Cast: the merge only reads id/updatedAt, so partial rows are enough.
    tasks: tasks as SyncState["tasks"],
    deletions,
  };
}

const grave = (id: string, deletedAt: number): Tombstone => ({
  id,
  table: "tasks",
  deletedAt,
});

describe("mergeRows", () => {
  it("keeps the copy with the greater updatedAt", () => {
    const merged = mergeRows([row("a", 100)], [row("a", 200)]);
    expect(merged).toEqual([row("a", 200)]);
  });

  it("keeps the local copy when it is newer", () => {
    const merged = mergeRows([row("a", 300)], [row("a", 200)]);
    expect(merged).toEqual([row("a", 300)]);
  });

  it("unions rows that exist on only one side", () => {
    const merged = mergeRows([row("a", 1)], [row("b", 1)]);
    expect(merged.map((r) => r.id).sort()).toEqual(["a", "b"]);
  });

  it("prefers remote on an updatedAt tie, so a re-push is stable", () => {
    const local = { id: "a", updatedAt: 100, title: "local" };
    const remote = { id: "a", updatedAt: 100, title: "remote" };
    expect(mergeRows([local], [remote])).toEqual([remote]);
    // Idempotent: merging the result back in changes nothing.
    expect(mergeRows([remote], [remote])).toEqual([remote]);
  });
});

describe("mergeTombstones", () => {
  it("keeps the earliest deletedAt for the same id", () => {
    const merged = mergeTombstones([grave("a", 500)], [grave("a", 200)]);
    expect(merged).toEqual([grave("a", 200)]);
  });

  it("unions tombstones for different ids", () => {
    const merged = mergeTombstones([grave("a", 1)], [grave("b", 2)]);
    expect(merged.map((t) => t.id).sort()).toEqual(["a", "b"]);
  });
});

describe("gcTombstones", () => {
  it("drops tombstones older than the TTL", () => {
    const now = 1_000_000_000;
    const fresh = grave("fresh", now - 1000);
    const stale = grave("stale", now - TOMBSTONE_TTL_MS - 1);
    expect(gcTombstones([fresh, stale], now)).toEqual([fresh]);
  });

  it("keeps a tombstone exactly at the TTL boundary minus one ms", () => {
    const now = 1_000_000_000;
    const edge = grave("edge", now - TOMBSTONE_TTL_MS + 1);
    expect(gcTombstones([edge], now)).toEqual([edge]);
  });
});

describe("mergeStates", () => {
  const now = 1_000_000;

  it("suppresses an item deleted after its last edit", () => {
    const local = state([row("t1", 100)]);
    const remote = state([], [grave("t1", 200)]);
    const merged = mergeStates(local, remote, now);
    expect(merged.tasks).toEqual([]);
    expect(merged.deletions).toEqual([grave("t1", 200)]);
  });

  it("suppresses an item deleted at exactly its updatedAt", () => {
    const merged = mergeStates(
      state([row("t1", 200)]),
      state([], [grave("t1", 200)]),
      now,
    );
    expect(merged.tasks).toEqual([]);
  });

  it("resurrects an item edited strictly after the delete", () => {
    const local = state([row("t1", 300)]);
    const remote = state([], [grave("t1", 200)]);
    const merged = mergeStates(local, remote, now);
    expect(merged.tasks).toEqual([row("t1", 300)]);
    // The tombstone is dropped so it can't re-suppress the item later.
    expect(merged.deletions).toEqual([]);
  });

  it("does not let an expired tombstone suppress an item", () => {
    const local = state([row("t1", 100)]);
    const remote = state([], [grave("t1", now - TOMBSTONE_TTL_MS - 1)]);
    const merged = mergeStates(local, remote, now);
    expect(merged.tasks).toEqual([row("t1", 100)]);
    expect(merged.deletions).toEqual([]);
  });

  it("is idempotent — merging a result with an input reproduces it", () => {
    const local = state([row("a", 300), row("b", 100)], [grave("c", 50)]);
    const remote = state([row("b", 200), row("d", 400)], [grave("a", 10)]);
    const once = mergeStates(local, remote, now);
    const twice = mergeStates(once, remote, now);
    expect(sorted(twice)).toEqual(sorted(once));
  });

  it("agrees regardless of argument order (ties aside)", () => {
    const local = state([row("a", 300), row("b", 100)], [grave("c", 50)]);
    const remote = state([row("b", 200), row("d", 400)], [grave("a", 10)]);
    expect(sorted(mergeStates(local, remote, now))).toEqual(
      sorted(mergeStates(remote, local, now)),
    );
  });

  it("keeps an empty merge empty", () => {
    const merged = mergeStates(emptySyncState(), emptySyncState(), now);
    expect(countRows(merged)).toBe(0);
    expect(merged.deletions).toEqual([]);
  });

  it("scopes tombstones by table so ids never collide across tables", () => {
    const local: SyncState = {
      ...emptySyncState(),
      tasks: [row("shared-id", 100)] as SyncState["tasks"],
      markers: [row("shared-id", 100)] as SyncState["markers"],
    };
    // Only the task was deleted; the marker with the same id must survive.
    const remote: SyncState = {
      ...emptySyncState(),
      deletions: [{ id: "shared-id", table: "tasks", deletedAt: 200 }],
    };
    const merged = mergeStates(local, remote, now);
    expect(merged.tasks).toEqual([]);
    expect(merged.markers).toEqual([row("shared-id", 100)]);
  });
});

/** Stable ordering so set-semantics comparisons don't depend on insertion. */
function sorted(s: SyncState) {
  return {
    tasks: [...s.tasks].sort((a, b) => a.id.localeCompare(b.id)),
    deletions: [...s.deletions].sort((a, b) => a.id.localeCompare(b.id)),
  };
}
