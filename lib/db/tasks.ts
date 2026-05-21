import type { Task } from "@/lib/types";
import { db } from "./index";
import { newId, now } from "./util";

/** Fields supplied when creating a task (id/createdAt/updatedAt generated). */
export type TaskInput = Omit<Task, "id" | "createdAt" | "updatedAt">;

/** Fields that may be patched on an existing task (updatedAt is bumped). */
export type TaskChanges = Partial<Omit<Task, "id" | "createdAt" | "updatedAt">>;

export async function createTask(input: TaskInput): Promise<Task> {
  const ts = now();
  const task: Task = { ...input, id: newId(), createdAt: ts, updatedAt: ts };
  await db.tasks.add(task);
  return task;
}

export function getTask(id: string): Promise<Task | undefined> {
  return db.tasks.get(id);
}

/** All tasks, ascending by `startDate`. */
export function getAllTasks(): Promise<Task[]> {
  return db.tasks.orderBy("startDate").toArray();
}

/** Tasks belonging to a single project. */
export function getTasksByProject(projectId: string): Promise<Task[]> {
  return db.tasks.where("projectId").equals(projectId).toArray();
}

export async function updateTask(id: string, changes: TaskChanges): Promise<void> {
  await db.tasks.update(id, { ...changes, updatedAt: now() });
}

export async function deleteTask(id: string): Promise<void> {
  await db.tasks.delete(id);
}
