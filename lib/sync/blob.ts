/**
 * Server-only Blob access for account sync.
 *
 * One document per user at `sync/{userId}.json`, deterministic path so a write
 * overwrites in place. Mirrors lib/share/blob.ts, with one critical difference:
 * these blobs are PRIVATE. A share snapshot is meant to be world-readable via
 * an unguessable URL; a user's whole calendar is not, and a public blob URL is
 * a permanent unauthenticated read of everything they own.
 *
 * That difference forces a SECOND store. A Vercel Blob store is public or
 * private for its whole lifetime — `access: "private"` against the public
 * `calendar-shares` store fails outright — so sync writes to its own private
 * store, addressed by its own token. Every call here passes that token
 * explicitly; omitting it would silently fall back to BLOB_READ_WRITE_TOKEN
 * and write a user's private calendar into the world-readable share store.
 *
 * Concurrency caveat: Blob has no compare-and-swap, so two devices syncing in
 * the same instant can interleave read-modify-write and lose one side's push.
 * The merge is per-item LWW, so the loser's next sync re-pushes whatever it
 * still holds locally and the states converge — the window costs a round trip,
 * not data. Moving to a store with conditional writes would close it entirely.
 */
import "server-only";
import { get, put } from "@vercel/blob";
import { SYNC_VERSION, type SyncDocument, type SyncState } from "./types";

/**
 * Read-write token for the PRIVATE sync store — deliberately not
 * BLOB_READ_WRITE_TOKEN, which belongs to the public share store.
 */
function syncToken(): string | undefined {
  return process.env.SYNC_BLOB_READ_WRITE_TOKEN;
}

/** Whether the private sync store is wired up. */
export function isSyncBlobConfigured(): boolean {
  return Boolean(syncToken());
}

/** The blob path holding a user's synced calendar. */
export function syncPath(userId: string): string {
  return `sync/${userId}.json`;
}

/**
 * Read a user's sync document, or null if they've never synced.
 *
 * `useCache: false` bypasses the CDN and reads origin storage. A cached read
 * here would merge against a stale document and silently resurrect rows the
 * user just deleted, so correctness beats the saved milliseconds.
 */
export async function getSyncDocument(
  userId: string,
): Promise<SyncDocument | null> {
  const result = await get(syncPath(userId), {
    access: "private",
    useCache: false,
    token: syncToken(),
  });
  if (!result?.stream) return null; // never synced, or a 304 with no body
  const raw: unknown = await new Response(result.stream)
    .json()
    .catch(() => null);
  return parseSyncDocument(raw);
}

/** Write a user's merged state back. Returns the stored document. */
export async function putSyncDocument(
  userId: string,
  state: SyncState,
  syncedAt: number = Date.now(),
): Promise<SyncDocument> {
  const doc: SyncDocument = { ...state, v: SYNC_VERSION, syncedAt };
  await put(syncPath(userId), JSON.stringify(doc), {
    // Private: this is the user's entire calendar. A public blob URL would be
    // a permanent unauthenticated read of everything they own — unlike a share
    // snapshot, which is deliberately world-readable.
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    token: syncToken(),
  });
  return doc;
}

/**
 * Validate + narrow parsed JSON to a SyncDocument, or null if malformed or a
 * version we don't understand. A corrupt document must not throw mid-sync —
 * returning null makes the server treat it as "no remote state yet", and the
 * pushing device's data becomes the new baseline rather than being rejected.
 */
export function parseSyncDocument(raw: unknown): SyncDocument | null {
  if (typeof raw !== "object" || raw === null) return null;
  const d = raw as Partial<SyncDocument>;
  if (d.v !== SYNC_VERSION) return null;
  if (typeof d.syncedAt !== "number") return null;
  if (
    !Array.isArray(d.projects) ||
    !Array.isArray(d.taskTypes) ||
    !Array.isArray(d.tasks) ||
    !Array.isArray(d.markers) ||
    !Array.isArray(d.deletions)
  ) {
    return null;
  }
  return d as SyncDocument;
}
