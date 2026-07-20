/**
 * Pure merge for account sync — no I/O, no Dexie, no Blob.
 *
 * The rules, in one place:
 *
 *  1. Per item, the copy with the greater `updatedAt` wins (last-write-wins).
 *     Ties keep the incumbent (`remote`), so a repeated push is a no-op rather
 *     than flapping between two equal-timestamped copies.
 *  2. A tombstone suppresses an item only if it is at least as recent as that
 *     item's `updatedAt`. An edit made strictly after a delete resurrects the
 *     item — that direction is chosen deliberately: losing a fresh edit is
 *     worse than resurrecting something the user can delete again.
 *  3. Tombstones older than TOMBSTONE_TTL_MS are dropped. Long enough that any
 *     device syncing within the window learns of the deletion; short enough
 *     that the list doesn't grow forever.
 *
 * Merging is symmetric and idempotent: merge(a, b) and merge(b, a) agree on
 * every item except `updatedAt` ties, and merging a result with either input
 * returns that result unchanged. That property is what lets the same function
 * run on the server (authoritative store) and be trusted by every client.
 */
import {
  SYNC_TABLES,
  TOMBSTONE_TTL_MS,
  type SyncState,
  type Syncable,
  type Tombstone,
} from "./types";

/**
 * Merge one table's rows by id, last-write-wins on `updatedAt`.
 * `remote` wins ties (see rule 1).
 */
export function mergeRows<T extends Syncable>(local: T[], remote: T[]): T[] {
  const byId = new Map<string, T>();
  for (const row of local) byId.set(row.id, row);
  for (const row of remote) {
    const mine = byId.get(row.id);
    // `>=` — remote wins ties, keeping a re-push stable.
    if (!mine || row.updatedAt >= mine.updatedAt) byId.set(row.id, row);
  }
  return [...byId.values()];
}

/**
 * Merge two tombstone lists, keeping the EARLIEST deletedAt per id. The first
 * device to delete defines when the deletion happened; a later device echoing
 * the same tombstone must not push the timestamp forward, or it could start
 * out-ranking an edit that legitimately resurrected the item.
 */
export function mergeTombstones(
  local: Tombstone[],
  remote: Tombstone[],
): Tombstone[] {
  const byId = new Map<string, Tombstone>();
  for (const t of [...local, ...remote]) {
    const seen = byId.get(t.id);
    if (!seen || t.deletedAt < seen.deletedAt) byId.set(t.id, t);
  }
  return [...byId.values()];
}

/** Drop tombstones older than the TTL, measured from `now`. */
export function gcTombstones(
  tombstones: Tombstone[],
  now: number,
): Tombstone[] {
  return tombstones.filter((t) => now - t.deletedAt < TOMBSTONE_TTL_MS);
}

/**
 * Merge two full sync states into the authoritative result.
 *
 * `local` is the pushing device's data, `remote` the stored document. `now`
 * is injectable so tombstone GC is deterministic in tests.
 */
export function mergeStates(
  local: SyncState,
  remote: SyncState,
  now: number = Date.now(),
): SyncState {
  const tombstones = gcTombstones(
    mergeTombstones(local.deletions, remote.deletions),
    now,
  );

  // Deletion lookup, scoped by table so ids never collide across tables.
  const deletedAt = new Map<string, number>();
  for (const t of tombstones) deletedAt.set(`${t.table}:${t.id}`, t.deletedAt);

  const out = {} as SyncState;
  // Keys of items that survived a tombstone (rule 2's resurrection case).
  const resurrected = new Set<string>();

  for (const table of SYNC_TABLES) {
    const merged = mergeRows(
      local[table] as Syncable[],
      remote[table] as Syncable[],
    );
    // Rule 2: a tombstone at least as recent as the surviving copy wins.
    const kept = merged.filter((row) => {
      const key = `${table}:${row.id}`;
      const at = deletedAt.get(key);
      if (at === undefined) return true;
      if (row.updatedAt > at) {
        resurrected.add(key);
        return true;
      }
      return false;
    });
    // Assigning through the union of row types; each table keeps its own type.
    (out[table] as Syncable[]) = kept;
  }

  // Drop tombstones whose item came back, so it isn't re-suppressed later.
  out.deletions = tombstones.filter(
    (t) => !resurrected.has(`${t.table}:${t.id}`),
  );

  return out;
}

/** Total row count across the entity tables (for logging / UI counts). */
export function countRows(state: SyncState): number {
  return SYNC_TABLES.reduce(
    (n, table) => n + (state[table] as Syncable[]).length,
    0,
  );
}
