import Dexie, { type Table } from "dexie";
import type { Project, TaskType, Task, Marker, ShareRecord } from "@/lib/types";
import { planTaskTypeScopeMigration } from "@/lib/taskType/scope";
import { planMarkerScopeMigration } from "@/lib/calendar/markers";
import { defaultProjectId } from "@/lib/project/manage";
import { newId } from "./util";

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
  shares!: Table<ShareRecord, string>;

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
    // v3 (US-020): task types become per-project. taskTypes gains a `projectId`
    // index; the upgrade clones each existing global type into every project,
    // relinks each task's taskTypeId to its project's clone, and removes the
    // originals (existing data preserved). A fresh DB opens straight at v3 with
    // no upgrade — seedIfEmpty seeds the default project's per-project types.
    this.version(3)
      .stores({
        projects: "id, order, visible",
        taskTypes: "id, projectId, order",
        tasks: "id, projectId, taskTypeId, startDate, endDate",
        markers: "id, date, kind, projectId",
      })
      .upgrade(async (tx) => {
        const [projects, globalTaskTypes, tasks] = await Promise.all([
          tx.table("projects").toArray() as Promise<Project[]>,
          tx.table("taskTypes").toArray() as Promise<TaskType[]>,
          tx.table("tasks").toArray() as Promise<Task[]>,
        ]);
        if (projects.length === 0 || globalTaskTypes.length === 0) return;
        const plan = planTaskTypeScopeMigration(
          projects,
          globalTaskTypes,
          tasks,
          newId,
          Date.now(),
        );
        const types = tx.table("taskTypes");
        const taskTable = tx.table("tasks");
        await types.bulkAdd(plan.taskTypes);
        await Promise.all(
          plan.relinks.map((r) =>
            taskTable.update(r.id, { taskTypeId: r.taskTypeId }),
          ),
        );
        await types.bulkDelete(plan.removeTaskTypeIds);
      });
    // v4 (US-021): markers become per-project. The `projectId` index already
    // exists, so the store schema is unchanged; the upgrade assigns the default
    // project to any marker still missing one (existing data preserved). A fresh
    // DB opens straight at v4 with no upgrade — new markers carry a projectId.
    this.version(4)
      .stores({
        projects: "id, order, visible",
        taskTypes: "id, projectId, order",
        tasks: "id, projectId, taskTypeId, startDate, endDate",
        markers: "id, date, kind, projectId",
      })
      .upgrade(async (tx) => {
        const [projects, markers] = await Promise.all([
          tx.table("projects").toArray() as Promise<Project[]>,
          tx.table("markers").toArray() as Promise<Marker[]>,
        ]);
        const fallback = defaultProjectId(projects);
        if (!fallback) return; // no projects — nothing to assign to
        const relinks = planMarkerScopeMigration(markers, fallback);
        const markerTable = tx.table("markers");
        await Promise.all(
          relinks.map((r) => markerTable.update(r.id, { projectId: r.projectId })),
        );
      });
    // v5 (US-025): local share registry. A brand-new `shares` table keyed by
    // projectId — adding a table needs no data upgrade; existing tables are
    // re-declared unchanged so Dexie carries them forward.
    this.version(5).stores({
      projects: "id, order, visible",
      taskTypes: "id, projectId, order",
      tasks: "id, projectId, taskTypeId, startDate, endDate",
      markers: "id, date, kind, projectId",
      shares: "projectId, token",
    });
    // v6 (edit links): a share gains `editToken` (read-write capability) and
    // `publishedAt` (last-synced snapshot time, for pulling collaborator edits).
    // Both are non-indexed props Dexie stores automatically — no data upgrade is
    // needed; legacy v5 rows simply read them as undefined until a refresh mints
    // an editToken. `editToken` is indexed for potential lookup but old rows
    // missing it just won't appear in that index.
    this.version(6).stores({
      projects: "id, order, visible",
      taskTypes: "id, projectId, order",
      tasks: "id, projectId, taskTypeId, startDate, endDate",
      markers: "id, date, kind, projectId",
      shares: "projectId, token, editToken",
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
export * from "./shares";
export * from "./seed";
