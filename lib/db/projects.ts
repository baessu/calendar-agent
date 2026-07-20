import type { Project } from "@/lib/types";
import { db } from "./index";
import { recordDeletion } from "./deletions";
import { newId, now } from "./util";

/** Fields supplied when creating a project (id/createdAt/updatedAt generated). */
export type ProjectInput = Omit<Project, "id" | "createdAt" | "updatedAt">;

/** Fields that may be patched on an existing project (updatedAt is bumped). */
export type ProjectChanges = Partial<
  Omit<Project, "id" | "createdAt" | "updatedAt">
>;

export async function createProject(input: ProjectInput): Promise<Project> {
  const ts = now();
  const project: Project = {
    ...input,
    id: newId(),
    createdAt: ts,
    updatedAt: ts,
  };
  await db.projects.add(project);
  return project;
}

export function getProject(id: string): Promise<Project | undefined> {
  return db.projects.get(id);
}

/** All projects, ascending by `order`. */
export function getAllProjects(): Promise<Project[]> {
  return db.projects.orderBy("order").toArray();
}

export async function updateProject(
  id: string,
  changes: ProjectChanges,
): Promise<void> {
  await db.projects.update(id, { ...changes, updatedAt: now() });
}

export async function deleteProject(id: string): Promise<void> {
  await db.projects.delete(id);
  await recordDeletion("projects", id);
}
