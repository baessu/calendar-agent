/**
 * Client side of account sync: collect local state, push it, adopt the merged
 * result. Browser-only (it touches Dexie).
 *
 * One round trip does both directions — the server merges what we send with
 * what it holds and returns the authoritative result, so there is no separate
 * pull and no ordering to get wrong.
 *
 * Adoption is a single rw transaction that replaces the synced tables outright.
 * That is safe because the merged result is a superset by construction: the
 * merge unions both sides, so the only rows missing from it are ones a
 * tombstone deliberately removed. Doing it transactionally means a failure
 * partway leaves local data exactly as it was, never half-merged.
 */
import { db } from "@/lib/db";
import type { Deletion, Marker, Project, Task, TaskType } from "@/lib/types";
import { SYNC_TABLES, type SyncDocument, type SyncState } from "./types";

/** Read the full local state (all synced tables + tombstones). */
export async function collectLocalState(): Promise<SyncState> {
  const [projects, taskTypes, tasks, markers, deletions] = await Promise.all([
    db.projects.toArray(),
    db.taskTypes.toArray(),
    db.tasks.toArray(),
    db.markers.toArray(),
    db.deletions.toArray(),
  ]);
  return { projects, taskTypes, tasks, markers, deletions };
}

/**
 * Overwrite local tables with the merged state. `shares` is untouched — a
 * published share is a device-held capability, not synced calendar content.
 */
export async function adoptMergedState(state: SyncState): Promise<void> {
  // Table array form — Dexie's variadic overload tops out below five tables.
  await db.transaction(
    "rw",
    [db.projects, db.taskTypes, db.tasks, db.markers, db.deletions],
    async () => {
      await Promise.all([
        db.projects.clear(),
        db.taskTypes.clear(),
        db.tasks.clear(),
        db.markers.clear(),
        db.deletions.clear(),
      ]);
      await Promise.all([
        db.projects.bulkAdd(state.projects as Project[]),
        db.taskTypes.bulkAdd(state.taskTypes as TaskType[]),
        db.tasks.bulkAdd(state.tasks as Task[]),
        db.markers.bulkAdd(state.markers as Marker[]),
        db.deletions.bulkAdd(state.deletions as Deletion[]),
      ]);
    },
  );
}

/** What a completed sync reports back to the UI. */
export interface SyncResult {
  syncedAt: number;
  /** Row counts after the merge, for a "12 items synced" style message. */
  counts: Record<(typeof SYNC_TABLES)[number], number>;
}

/** Raised for a sync that failed in a way the UI should explain, not swallow. */
export class SyncError extends Error {
  constructor(
    message: string,
    /** HTTP status when the failure came from the server, else 0. */
    readonly status: number = 0,
  ) {
    super(message);
    this.name = "SyncError";
  }
}

/**
 * Run one full sync. Throws SyncError on failure so callers can distinguish
 * "signed out" (401) from "sync not set up" (503) from a network blip.
 */
export async function runSync(signal?: AbortSignal): Promise<SyncResult> {
  const local = await collectLocalState();

  const res = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(local),
    signal,
  });

  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new SyncError(detail?.error ?? `sync failed (${res.status})`, res.status);
  }

  const doc = (await res.json()) as SyncDocument;
  await adoptMergedState(doc);

  return {
    syncedAt: doc.syncedAt,
    counts: {
      projects: doc.projects.length,
      taskTypes: doc.taskTypes.length,
      tasks: doc.tasks.length,
      markers: doc.markers.length,
    },
  };
}
