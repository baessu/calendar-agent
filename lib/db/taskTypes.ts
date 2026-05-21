import type { TaskType } from "@/lib/types";
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

/** All task types, ascending by `order`. Globally shared across projects. */
export function getAllTaskTypes(): Promise<TaskType[]> {
  return db.taskTypes.orderBy("order").toArray();
}

export async function updateTaskType(id: string, changes: TaskTypeChanges): Promise<void> {
  await db.taskTypes.update(id, changes);
}

export async function deleteTaskType(id: string): Promise<void> {
  await db.taskTypes.delete(id);
}
