import Dexie, { type Table } from "dexie";
import type { Project, TaskType, Task, Marker } from "@/lib/types";

/**
 * Local IndexedDB store (Dexie).
 *
 * Browser-only: Dexie touches IndexedDB on open(), so import `db` from client
 * components. The constructor is SSR-safe (no IndexedDB access until open()).
 *
 * CRUD helpers and first-run seeding are re-exported below from sibling files.
 */
export class CalendarDB extends Dexie {
  // Tables (declared via stores() below; the "!" tells TS Dexie assigns them).
  projects!: Table<Project, string>;
  taskTypes!: Table<TaskType, string>;
  tasks!: Table<Task, string>;
  markers!: Table<Marker, string>;

  constructor() {
    super("CalendarDB");
    // Primary key `id` (string UUIDs we generate) + indexes used by queries.
    this.version(1).stores({
      projects: "id, order, visible",
      taskTypes: "id, order",
      tasks: "id, projectId, taskTypeId, startDate, endDate",
      markers: "id, date, kind, projectId",
    });
    // v2 (US-019): Task gains an optional `note`. It is not indexed, so the
    // store schema is unchanged — Dexie stores non-indexed props automatically
    // and existing rows simply read `note === undefined` (no migration needed).
    this.version(2).stores({
      projects: "id, order, visible",
      taskTypes: "id, order",
      tasks: "id, projectId, taskTypeId, startDate, endDate",
      markers: "id, date, kind, projectId",
    });
  }
}

export const db = new CalendarDB();

// Barrel re-exports. `db` is defined above before these run, and the CRUD
// modules only touch `db` inside function bodies, so the cycle is safe.
export * from "./projects";
export * from "./taskTypes";
export * from "./tasks";
export * from "./markers";
export * from "./seed";
