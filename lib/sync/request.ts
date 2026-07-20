/**
 * Validation for the sync request body — the one place untrusted client JSON
 * becomes a typed SyncState.
 *
 * This is a trust boundary, so it validates structurally rather than casting.
 * The bar is not "is this beautiful data" but "can the merge and the receiving
 * device's IndexedDB handle every row without throwing or corrupting state":
 * every row needs a string `id` and a numeric `updatedAt`, because those two
 * fields drive last-write-wins. Rows failing that are dropped, not rejected —
 * one malformed row shouldn't cost the user their whole sync.
 *
 * Note the payload is the user's own data going back to the same user, so this
 * guards data integrity, not cross-user access; that's the session check in the
 * route. Pure and side-effect free so it can be unit tested directly.
 */
import { SYNC_TABLES, isSyncTableName, type SyncState, type Tombstone } from "./types";

/** Max rows accepted per table — a sanity ceiling, far above real use. */
export const MAX_ROWS_PER_TABLE = 50_000;

/** Whether a value is a plain object (not null, not an array). */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Keep only rows that carry the fields the merge depends on. Everything else
 * about a row passes through untouched — the server is a merge point, not a
 * schema authority, so it must not silently drop fields a newer client added.
 */
function validRows(value: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > MAX_ROWS_PER_TABLE) return null;
  return value.filter(
    (row): row is Record<string, unknown> =>
      isRecord(row) &&
      typeof row.id === "string" &&
      row.id.length > 0 &&
      typeof row.updatedAt === "number" &&
      Number.isFinite(row.updatedAt),
  );
}

/** Keep only well-formed tombstones (id + known table + finite deletedAt). */
function validTombstones(value: unknown): Tombstone[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > MAX_ROWS_PER_TABLE) return null;
  return value.filter(
    (t): t is Tombstone =>
      isRecord(t) &&
      typeof t.id === "string" &&
      t.id.length > 0 &&
      isSyncTableName(t.table) &&
      typeof t.deletedAt === "number" &&
      Number.isFinite(t.deletedAt),
  );
}

/**
 * Narrow an unknown request body to a SyncState, or null if it isn't one.
 * A missing table is an error rather than an empty default: treating an absent
 * `tasks` key as "no tasks" would let a truncated request read as a mass
 * deletion of everything the other device holds.
 */
export function parseSyncStateRequest(body: unknown): SyncState | null {
  if (!isRecord(body)) return null;

  const out = {} as SyncState;
  for (const table of SYNC_TABLES) {
    const rows = validRows(body[table]);
    if (rows === null) return null;
    (out[table] as unknown[]) = rows;
  }

  const deletions = validTombstones(body.deletions);
  if (deletions === null) return null;
  out.deletions = deletions;

  return out;
}
