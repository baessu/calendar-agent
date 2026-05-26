import type { Marker, Project, Task } from "@/lib/types";

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

/**
 * Task-type filter for the task-type legend on/off toggles (US-015).
 *
 * Drops tasks whose task type is toggled off (its id is in `hiddenTaskTypeIds`),
 * removing that type's bars from both the calendar and the side panel. Unlike
 * project visibility this is an ephemeral view filter (not persisted). Order is
 * preserved; with nothing hidden the input is returned unchanged (memo-friendly).
 * Composes (AND) with `filterTasksByProject` and `filterTasksByVisibleProjects`.
 */
export function filterTasksByTaskTypes(
  tasks: Task[],
  hiddenTaskTypeIds: Set<string>,
): Task[] {
  if (hiddenTaskTypeIds.size === 0) return tasks;
  return tasks.filter((t) => !hiddenTaskTypeIds.has(t.taskTypeId));
}

/**
 * View filter for markers, mirroring `filterTasksByProject` (US-021).
 *
 * Markers are now scoped per project, so the top project tabs filter them the
 * same way as task bars: `null` is the merged "전체" view (every project's
 * markers, returned unchanged) and any other value keeps only that project's
 * markers. Order is preserved.
 */
export function filterMarkersByProject(
  markers: Marker[],
  selectedProjectId: string | null,
): Marker[] {
  if (selectedProjectId === null) return markers;
  return markers.filter((m) => m.projectId === selectedProjectId);
}

/**
 * Visibility filter for markers, mirroring `filterTasksByVisibleProjects`
 * (US-021). Drops markers whose owning project is toggled off so the project's
 * markers disappear from the calendar alongside its bars. A marker whose project
 * is absent from `projects` is kept (defensive). Order is preserved; with nothing
 * hidden the input is returned unchanged. Composes (AND) with
 * `filterMarkersByProject`.
 */
export function filterMarkersByVisibleProjects(
  markers: Marker[],
  projects: Project[],
): Marker[] {
  const hidden = new Set(projects.filter((p) => !p.visible).map((p) => p.id));
  if (hidden.size === 0) return markers;
  return markers.filter((m) => !hidden.has(m.projectId));
}
