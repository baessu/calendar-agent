/**
 * End-to-end sync behaviour against a real (fake-indexeddb) Dexie store.
 *
 * merge.test.ts covers the merge rules in isolation; this covers the parts that
 * only break when the pieces meet — that deletes actually leave tombstones,
 * that a collected state survives a merge and re-adoption, and that a deletion
 * made on one device removes the row on the other rather than being undone by
 * that device re-uploading its stale copy.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createProject } from "@/lib/db/projects";
import { createTask, deleteTask, updateTask } from "@/lib/db/tasks";
import { createMarker, deleteMarker } from "@/lib/db/markers";
import { adoptMergedState, collectLocalState } from "./client";
import { mergeStates } from "./merge";
import { emptySyncState } from "./types";

beforeEach(async () => {
  await Promise.all([
    db.projects.clear(),
    db.taskTypes.clear(),
    db.tasks.clear(),
    db.markers.clear(),
    db.deletions.clear(),
  ]);
});

/** A task belonging to a throwaway project. */
async function makeTask(title: string) {
  const project = await createProject({
    name: "P",
    color: "#3175B9",
    visible: true,
    order: 0,
  });
  return createTask({
    projectId: project.id,
    taskTypeId: "tt1",
    title,
    startDate: "2026-07-01",
    endDate: "2026-07-03",
  });
}

describe("tombstones", () => {
  it("records a tombstone when a task is deleted", async () => {
    const task = await makeTask("gone");
    await deleteTask(task.id);

    const state = await collectLocalState();
    expect(state.tasks).toEqual([]);
    expect(state.deletions).toEqual([
      expect.objectContaining({ id: task.id, table: "tasks" }),
    ]);
  });

  it("records a tombstone when a marker is deleted", async () => {
    const marker = await createMarker({
      kind: "event",
      label: "m",
      date: "2026-07-02",
      projectId: "p1",
    });
    await deleteMarker(marker.id);

    const state = await collectLocalState();
    expect(state.markers).toEqual([]);
    expect(state.deletions).toEqual([
      expect.objectContaining({ id: marker.id, table: "markers" }),
    ]);
  });

  it("stamps updatedAt on create and bumps it on update", async () => {
    const task = await makeTask("t");
    expect(task.updatedAt).toBe(task.createdAt);

    await updateTask(task.id, { title: "edited" });
    const after = await db.tasks.get(task.id);
    expect(after?.updatedAt).toBeGreaterThanOrEqual(task.updatedAt);
    expect(after?.createdAt).toBe(task.createdAt);
  });
});

describe("adoptMergedState", () => {
  it("is a no-op when the merged state equals local", async () => {
    await makeTask("keep");
    const before = await collectLocalState();

    await adoptMergedState(mergeStates(before, emptySyncState()));

    const after = await collectLocalState();
    expect(after.tasks).toEqual(before.tasks);
    expect(after.projects).toEqual(before.projects);
  });

  it("adds rows that exist only on the remote side", async () => {
    const remote = {
      ...emptySyncState(),
      tasks: [
        {
          id: "remote-task",
          projectId: "p1",
          taskTypeId: "tt1",
          title: "from other device",
          startDate: "2026-08-01",
          endDate: "2026-08-01",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };
    const merged = mergeStates(await collectLocalState(), remote);
    await adoptMergedState(merged);

    const after = await collectLocalState();
    expect(after.tasks.map((t) => t.id)).toEqual(["remote-task"]);
  });

  it("propagates a deletion made on the other device", async () => {
    // This device still holds the task; the other device deleted it later.
    const task = await makeTask("doomed");
    const local = await collectLocalState();
    const remote = {
      ...emptySyncState(),
      deletions: [
        {
          id: task.id,
          table: "tasks" as const,
          deletedAt: task.updatedAt + 1000,
        },
      ],
    };

    await adoptMergedState(mergeStates(local, remote));

    const after = await collectLocalState();
    expect(after.tasks).toEqual([]);
    // The tombstone is retained so a third device also learns of the deletion.
    expect(after.deletions).toHaveLength(1);
  });

  it("keeps a local edit that happened after the other device's delete", async () => {
    const task = await makeTask("revived");
    await updateTask(task.id, { title: "edited after delete" });
    const local = await collectLocalState();
    const remote = {
      ...emptySyncState(),
      deletions: [
        { id: task.id, table: "tasks" as const, deletedAt: task.updatedAt - 1 },
      ],
    };

    await adoptMergedState(mergeStates(local, remote));

    const after = await collectLocalState();
    expect(after.tasks.map((t) => t.title)).toEqual(["edited after delete"]);
    // Tombstone dropped, so the next sync can't re-kill the resurrected task.
    expect(after.deletions).toEqual([]);
  });

  it("leaves the shares table untouched (a share is device-local)", async () => {
    await db.shares.put({
      projectId: "p1",
      token: "tok",
      url: "https://example.com/x.json",
      updatedAt: 1,
    });

    await adoptMergedState(mergeStates(await collectLocalState(), emptySyncState()));

    expect(await db.shares.toArray()).toHaveLength(1);
  });
});
