import type { ShareRecord } from "@/lib/types";
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
