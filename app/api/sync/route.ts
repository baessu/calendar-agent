/**
 * POST /api/sync — the authenticated merge point for account sync.
 *
 * The device pushes its full local state; the server merges it with the stored
 * document (per-item LWW + tombstones) and returns the merged result, which the
 * device then adopts wholesale. One round trip does both directions, so there's
 * no push/pull ordering to get wrong.
 *
 * The user id comes from the session, never from the request body — otherwise
 * anyone could read or overwrite any account's calendar by naming its id.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { mergeStates } from "@/lib/sync/merge";
import {
  getSyncDocument,
  isSyncBlobConfigured,
  putSyncDocument,
} from "@/lib/sync/blob";
import { emptySyncState } from "@/lib/sync/types";
import { isEmptyState, isPristineSeed } from "@/lib/sync/pristine";
import { parseSyncStateRequest } from "@/lib/sync/request";

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isSyncBlobConfigured()) {
    return NextResponse.json(
      { error: "sync_not_configured" },
      { status: 503 },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const local = parseSyncStateRequest(body);
  if (!local) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const remote = (await getSyncDocument(userId)) ?? emptySyncState();

  // A device whose data is still the untouched first-run seed must not push it
  // into an account that already has content — that would add a duplicate
  // default project per device. Drop the seed and hand back what we hold. When
  // the account IS empty this doesn't apply, so the genuine first device's seed
  // still becomes the starting state.
  const seedOnly = isPristineSeed(local) && !isEmptyState(remote);
  const merged = mergeStates(seedOnly ? emptySyncState() : local, remote);
  const stored = await putSyncDocument(userId, merged);

  return NextResponse.json(stored);
}
