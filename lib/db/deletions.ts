/**
 * Tombstone bookkeeping for account sync.
 *
 * Every delete* helper records the removed row here. Without it a sync can't
 * distinguish "deleted on this device" from "not created here yet", and the
 * other device would helpfully re-upload the row the user just deleted.
 *
 * Tombstones are written unconditionally, even when the user is signed out —
 * a deletion made offline still has to propagate whenever sync next runs, and
 * an unused tombstone costs one small row that the TTL sweeps up anyway.
 */
import type { Deletion } from "@/lib/types";
import { db } from "./index";
import { now } from "./util";

/** Record a deletion. `put` (not `add`) so re-deleting an id is idempotent. */
export async function recordDeletion(
  table: Deletion["table"],
  id: string,
): Promise<void> {
  await db.deletions.put({ id, table, deletedAt: now() });
}

/** Record many deletions from one table in a single write. */
export async function recordDeletions(
  table: Deletion["table"],
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const deletedAt = now();
  await db.deletions.bulkPut(ids.map((id) => ({ id, table, deletedAt })));
}

/** All tombstones (the sync push sends these alongside the live rows). */
export function getAllDeletions(): Promise<Deletion[]> {
  return db.deletions.toArray();
}

/**
 * Replace the local tombstone set with the merged one from the server. Called
 * after a sync so GC'd and resurrected tombstones stop being re-pushed.
 */
export async function replaceDeletions(rows: Deletion[]): Promise<void> {
  await db.transaction("rw", db.deletions, async () => {
    await db.deletions.clear();
    if (rows.length > 0) await db.deletions.bulkAdd(rows);
  });
}

/** Forget a tombstone (used when an incoming edit resurrects the item). */
export async function clearDeletion(id: string): Promise<void> {
  await db.deletions.delete(id);
}
