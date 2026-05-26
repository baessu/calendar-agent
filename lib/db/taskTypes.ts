import type { TaskType } from "@/lib/types";
import { defaultTaskTypesForProject } from "@/lib/taskType/scope";
import { db } from "./index";
import { newId, now } from "./util";

/** Fields supplied when creating a task type (id/createdAt are generated). */
export type TaskTypeInput = Omit<TaskType, "id" | "createdAt">;

/** Fields that may be patched on an existing task type. */
export type TaskTypeChanges = Partial<Omit<TaskType, "id" | "createdAt">>;

export async function createTaskType(input: TaskTypeInput): Promise<TaskType> {
  const taskType: TaskType = { ...input, id: newId(), createdAt: now() };
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
export async function seedTaskTypesForProject(projectId: string): Promise<TaskType[]> {
  const types = defaultTaskTypesForProject(projectId, newId, now());
  await db.taskTypes.bulkAdd(types);
  return types;
}

export async function updateTaskType(id: string, changes: TaskTypeChanges): Promise<void> {
  await db.taskTypes.update(id, changes);
}

export async function deleteTaskType(id: string): Promise<void> {
  await db.taskTypes.delete(id);
}

/** Delete every task type owned by a project (used when deleting a project). */
export async function deleteTaskTypesByProject(projectId: string): Promise<void> {
  await db.taskTypes.where("projectId").equals(projectId).delete();
}
