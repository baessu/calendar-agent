import type { TaskType } from "@/lib/types";
import { defaultTaskTypesForProject } from "@/lib/taskType/scope";
import { db } from "./index";
import { recordDeletion, recordDeletions } from "./deletions";
import { newId, now } from "./util";

/** Fields supplied when creating a task type (id/createdAt/updatedAt generated). */
export type TaskTypeInput = Omit<TaskType, "id" | "createdAt" | "updatedAt">;

/** Fields that may be patched on an existing task type (updatedAt is bumped). */
export type TaskTypeChanges = Partial<
  Omit<TaskType, "id" | "createdAt" | "updatedAt">
>;

export async function createTaskType(input: TaskTypeInput): Promise<TaskType> {
  const ts = now();
  const taskType: TaskType = {
    ...input,
    id: newId(),
    createdAt: ts,
    updatedAt: ts,
  };
  await db.taskTypes.add(taskType);
  return taskType;
}

export function getTaskType(id: string): Promise<TaskType | undefined> {
  return db.taskTypes.get(id);
}

/** All task types, ascending by `order` (US-020: each carries a projectId). */
export function getAllTaskTypes(): Promise<TaskType[]> {
  return db.taskTypes.orderBy("order").toArray();
}

/** A single project's task types, ascending by `order` (US-020). */
export function getTaskTypesByProject(projectId: string): Promise<TaskType[]> {
  return db.taskTypes.where("projectId").equals(projectId).sortBy("order");
}

/** Seed a project's default 4 task types (US-020 AC2). Returns the created rows. */
export async function seedTaskTypesForProject(
  projectId: string,
): Promise<TaskType[]> {
  const types = defaultTaskTypesForProject(projectId, newId, now());
  await db.taskTypes.bulkAdd(types);
  return types;
}

export async function updateTaskType(
  id: string,
  changes: TaskTypeChanges,
): Promise<void> {
  await db.taskTypes.update(id, { ...changes, updatedAt: now() });
}

export async function deleteTaskType(id: string): Promise<void> {
  await db.taskTypes.delete(id);
  await recordDeletion("taskTypes", id);
}

/** Delete every task type owned by a project (used when deleting a project). */
export async function deleteTaskTypesByProject(
  projectId: string,
): Promise<void> {
  // Collect ids before deleting so each removal gets its own tombstone —
  // otherwise the other device never learns these rows are gone.
  const ids = await db.taskTypes
    .where("projectId")
    .equals(projectId)
    .primaryKeys();
  await db.taskTypes.where("projectId").equals(projectId).delete();
  await recordDeletions("taskTypes", ids);
}
