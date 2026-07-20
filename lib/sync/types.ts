/**
 * Account sync types (login-based multi-device sync).
 *
 * Sync moves the four owned entity tables — projects, taskTypes, tasks,
 * markers — between a device's local IndexedDB and one per-user Blob document.
 * The local `shares` table is deliberately NOT synced: a published share is a
 * device-held capability handle, not calendar content.
 *
 * Conflict resolution is per-item last-write-wins on `updatedAt`, with
 * tombstones carrying deletions across devices (a plain absence can't be told
 * apart from "not yet created here").
 */
import type { Marker, Project, Task, TaskType } from "@/lib/types";

/** The entity tables that participate in sync. */
export const SYNC_TABLES = [
  "projects",
  "taskTypes",
  "tasks",
  "markers",
] as const;

export type SyncTable = (typeof SYNC_TABLES)[number];

/** Current sync document schema version (bump on a breaking shape change). */
export const SYNC_VERSION = 1 as const;

/**
 * A deletion record. Kept after the row itself is gone so other devices learn
 * the item was removed rather than re-uploading their stale copy. GC'd once
 * older than TOMBSTONE_TTL_MS.
 */
export interface Tombstone {
  id: string;
  table: SyncTable;
  deletedAt: number;
}

/** How long tombstones are retained before GC (90 days). */
export const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** Anything mergeable: identified by `id`, versioned by `updatedAt`. */
export interface Syncable {
  id: string;
  updatedAt: number;
}

/**
 * The full synced data set — what a device uploads and what the server stores.
 * Table order/shape mirrors the Dexie stores so a push is a straight dump.
 */
export interface SyncState {
  projects: Project[];
  taskTypes: TaskType[];
  tasks: Task[];
  markers: Marker[];
  /** Deletions observed on any device, still within the TTL window. */
  deletions: Tombstone[];
}

/** The stored per-user document (a SyncState plus envelope metadata). */
export interface SyncDocument extends SyncState {
  v: typeof SYNC_VERSION;
  /** When the server last wrote this document (epoch ms). */
  syncedAt: number;
}

/** Narrow an unknown value to a known SyncTable name. */
export function isSyncTableName(v: unknown): v is SyncTable {
  return typeof v === "string" && (SYNC_TABLES as readonly string[]).includes(v);
}

/** An empty state — the starting point for a brand-new account. */
export function emptySyncState(): SyncState {
  return { projects: [], taskTypes: [], tasks: [], markers: [], deletions: [] };
}
