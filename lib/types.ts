/**
 * Shared domain types for the monthly calendar.
 *
 * Dates are stored as "YYYY-MM-DD" strings (no timezone) and compared via
 * local-midnight utils elsewhere. Timestamps are epoch milliseconds.
 */

/** A calendar date as "YYYY-MM-DD" (no time, no timezone). */
export type DateString = string;

/** Epoch milliseconds (Date.now()). */
export type Timestamp = number;

/** Tone direction applied to a project color to build a task-type shade. */
export type ToneMode = "dark" | "tint";

/** Point-date marker kind (rendered as a monochrome chip, not a colored bar). */
export type MarkerKind = "event" | "deadline";

/** A project — identity color is one of the same-tone 8 hues (S58 L46). */
export interface Project {
  id: string;
  name: string;
  /** HEX from PROJECT_COLORS (e.g. "#3175B9"). */
  color: string;
  visible: boolean;
  order: number;
  createdAt: Timestamp;
  /** Last local edit — the version account sync merges on (LWW). */
  updatedAt: Timestamp;
  /**
   * When the project was archived (epoch ms), or absent/0 = active. Archiving a
   * completed project hides it and its tasks/markers/types from normal views
   * without deleting anything; it can be restored. Distinct from `visible`,
   * which is a temporary merged-view filter, not a "put away" state.
   */
  archivedAt?: Timestamp;
}

/** A per-project task type (US-020) — defines the tone applied over the
 *  project's color. Each type belongs to exactly one project. */
export interface TaskType {
  id: string;
  /** Owning project (US-020); task types are scoped per project, not global. */
  projectId: string;
  name: string;
  mode: ToneMode;
  /** Tone strength 0..1 (dark = darken, tint = mix toward white). */
  k: number;
  order: number;
  createdAt: Timestamp;
  /** Last local edit — the version account sync merges on (LWW). */
  updatedAt: Timestamp;
  /**
   * When this task type was archived (epoch ms), or absent/0 = active. An
   * archived type is dropped from the type picker + the type list, but its
   * existing tasks stay on the calendar. Restorable.
   */
  archivedAt?: Timestamp;
}

/** A dated task — spans startDate..endDate inclusive, rendered as a bar. */
export interface Task {
  id: string;
  projectId: string;
  taskTypeId: string;
  title: string;
  startDate: DateString;
  endDate: DateString;
  /** Optional free-text note (US-019). Absent/empty = no note. */
  note?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Local registry of a project's published share (US-025). One row per shared
 * project (projectId is the key); holds the token + public URL so the UI can
 * show share state and refresh/revoke. The Blob snapshot is the published copy;
 * this row is just the local handle to it.
 */
export interface ShareRecord {
  /** Primary key — a project has at most one active share. */
  projectId: string;
  /** Read-only capability — the public view link `/s/{token}`. */
  token: string;
  /**
   * Read-write capability — the edit link `/e/{editToken}`. The owner always
   * holds it (it authorizes refresh/revoke) and may hand it to a collaborator
   * to grant editing. Optional only for legacy rows published before edit
   * links existed; a refresh mints one (see app/api/share).
   */
  editToken?: string;
  /** Public Blob URL of the snapshot (returned by publish). */
  url: string;
  /**
   * The `publishedAt` of the snapshot the owner last synced to (their own
   * publish/refresh, or a pull of a collaborator's edits). Comparing it to the
   * Blob's current `publishedAt` tells the owner a collaborator has edited
   * since (US: pull). Optional for legacy rows.
   */
  publishedAt?: Timestamp;
  /** When this local row was last written. */
  updatedAt: Timestamp;
}

/**
 * A local deletion record (account sync). Written by the delete* helpers and
 * kept after the row itself is gone, so a sync can tell other devices the item
 * was removed rather than have them re-upload their stale copy. GC'd by
 * `lib/sync/merge` once older than the tombstone TTL.
 */
export interface Deletion {
  /** The deleted row's id (primary key — an id is deleted at most once). */
  id: string;
  /** Which table it was deleted from; ids are only unique per table. */
  table: "projects" | "taskTypes" | "tasks" | "markers";
  deletedAt: Timestamp;
}

/** A point-date marker (event / hard deadline). */
export interface Marker {
  id: string;
  kind: MarkerKind;
  label: string;
  date: DateString;
  /** Owning project (US-021); markers are scoped per project, like tasks. */
  projectId: string;
  createdAt: Timestamp;
  /** Last local edit — the version account sync merges on (LWW). */
  updatedAt: Timestamp;
}
