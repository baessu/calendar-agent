import type { Marker, ShareRecord, Task, TaskType } from "@/lib/types";
import { db } from "./index";
import { now } from "./util";

/**
 * Local share registry CRUD (US-025). One row per project (projectId key) holds
 * the token + public URL of its published snapshot. The Blob is the source of
 * truth for what viewers see; these rows just let the UI show share state and
 * re-publish / revoke. `putShare` upserts so publish-then-refresh keeps one row.
 */

export function getShare(projectId: string): Promise<ShareRecord | undefined> {
  return db.shares.get(projectId);
}

export function getAllShares(): Promise<ShareRecord[]> {
  return db.shares.toArray();
}

export async function putShare(
  record: Omit<ShareRecord, "updatedAt">,
): Promise<ShareRecord> {
  const row: ShareRecord = { ...record, updatedAt: now() };
  await db.shares.put(row);
  return row;
}

export async function deleteShare(projectId: string): Promise<void> {
  await db.shares.delete(projectId);
}

/**
 * Pull a collaborator's edits back into local storage (edit-link sharing).
 *
 * Replaces, in one transaction, the project's tasks and markers with the
 * published snapshot's, and upserts its task types (collaborators can't change
 * types, but upserting keeps ids aligned defensively). This is last-write-wins
 * at the project granularity: whatever the shared copy holds becomes the local
 * truth for that project. Other projects are untouched.
 */
export async function replaceProjectSharedData(
  projectId: string,
  data: { taskTypes: TaskType[]; tasks: Task[]; markers: Marker[] },
): Promise<void> {
  await db.transaction("rw", db.tasks, db.markers, db.taskTypes, async () => {
    const [oldTaskIds, oldMarkerIds] = await Promise.all([
      db.tasks.where("projectId").equals(projectId).primaryKeys(),
      db.markers.where("projectId").equals(projectId).primaryKeys(),
    ]);
    await Promise.all([
      db.tasks.bulkDelete(oldTaskIds as string[]),
      db.markers.bulkDelete(oldMarkerIds as string[]),
    ]);
    await Promise.all([
      db.tasks.bulkPut(data.tasks),
      db.markers.bulkPut(data.markers),
      db.taskTypes.bulkPut(data.taskTypes),
    ]);
  });
}
