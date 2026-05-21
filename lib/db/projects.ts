import type { Project } from "@/lib/types";
import { db } from "./index";
import { newId, now } from "./util";

/** Fields supplied when creating a project (id/createdAt are generated). */
export type ProjectInput = Omit<Project, "id" | "createdAt">;

/** Fields that may be patched on an existing project. */
export type ProjectChanges = Partial<Omit<Project, "id" | "createdAt">>;

export async function createProject(input: ProjectInput): Promise<Project> {
  const project: Project = { ...input, id: newId(), createdAt: now() };
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

export async function updateProject(id: string, changes: ProjectChanges): Promise<void> {
  await db.projects.update(id, changes);
}

export async function deleteProject(id: string): Promise<void> {
  await db.projects.delete(id);
}
