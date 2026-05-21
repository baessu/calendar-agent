import type { Project, Task } from "@/lib/types";

/**
 * View filter for the top project tabs (US-013).
 *
 * `selectedProjectId === null` is the merged "전체" view (every project's bars,
 * distinguished by hue). Any other value is an individual project view: only
 * that project's tasks (task-type tone is preserved by the bar color logic).
 * Order is preserved; the merged view returns the input unchanged.
 */
export function filterTasksByProject(
  tasks: Task[],
  selectedProjectId: string | null,
): Task[] {
  if (selectedProjectId === null) return tasks;
  return tasks.filter((t) => t.projectId === selectedProjectId);
}

/**
 * Visibility filter for the per-project show/hide toggles (US-014).
 *
 * Drops tasks whose owning project is toggled off (`visible === false`) so the
 * project disappears from both the calendar and the side panel. A task whose
 * project is absent from `projects` is kept (defensive — should not happen).
 * Order is preserved; with nothing hidden the input is returned unchanged.
 * Composes (AND) with `filterTasksByProject`.
 */
export function filterTasksByVisibleProjects(
  tasks: Task[],
  projects: Project[],
): Task[] {
  const hidden = new Set(projects.filter((p) => !p.visible).map((p) => p.id));
  if (hidden.size === 0) return tasks;
  return tasks.filter((t) => !hidden.has(t.projectId));
}
