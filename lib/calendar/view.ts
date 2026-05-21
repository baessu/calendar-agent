import type { Task } from "@/lib/types";

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
