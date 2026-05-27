/**
 * Server-only Vercel Blob access for shares (US-023).
 *
 * Isolates every `@vercel/blob` call so the rest of the app stays storage-
 * agnostic. Snapshots are public blobs at a deterministic path
 * (shares/{token}.json, no random suffix) so refresh overwrites in place and a
 * token alone can resolve the blob. Requires BLOB_READ_WRITE_TOKEN at runtime.
 */
import "server-only";
import { del, list, put } from "@vercel/blob";
import { snapshotPath } from "./token";
import type { ShareSnapshot } from "./snapshot";

/** Whether Blob is wired up (store connected + token present). */
export function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/** Publish or refresh a snapshot; returns its public URL. */
export async function putSnapshot(
  token: string,
  snapshot: ShareSnapshot,
): Promise<{ url: string }> {
  const { url } = await put(snapshotPath(token), JSON.stringify(snapshot), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true, // refresh re-publishes to the same path
    contentType: "application/json",
    cacheControlMaxAge: 60, // min allowed; a refresh propagates within ~1 min
  });
  return { url };
}

/** Delete a snapshot (revoke). No-op-safe if it's already gone. */
export async function delSnapshot(token: string): Promise<void> {
  const path = snapshotPath(token);
  const { blobs } = await list({ prefix: path, limit: 1 });
  const blob = blobs.find((b) => b.pathname === path);
  if (blob) await del(blob.url);
}

/**
 * Fetch + return a token's raw snapshot JSON (unparsed), or null if no such
 * blob. Server-side only; the public viewer never gets Blob credentials.
 */
export async function fetchSnapshotRaw(token: string): Promise<unknown | null> {
  const path = snapshotPath(token);
  const { blobs } = await list({ prefix: path, limit: 1 });
  const blob = blobs.find((b) => b.pathname === path);
  if (!blob) return null;
  const res = await fetch(blob.url, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}
