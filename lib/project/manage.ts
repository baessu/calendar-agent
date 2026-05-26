/**
 * Pure helpers for project management (US-011).
 *
 * Kept side-effect-free so they can be unit tested: the React layer wires these
 * into create/rename/recolor/delete flows. Color identity values come from
 * docs/design/color-system.md via PROJECT_COLORS (never invented here).
 */
import { PROJECT_COLORS } from "@/lib/color/tokens";
import type { Project } from "@/lib/types";

/**
 * The protected "default" project: it cannot be deleted, and orphaned tasks
 * from a deleted project are reassigned to it. We define it as the earliest
 * created project (the seeded "기본"), with the id as a stable tiebreak. No
 * schema flag is needed, so this also works for pre-existing local data.
 * Returns null only when there are no projects.
 */
export function defaultProjectId(projects: Project[]): string | null {
  if (projects.length === 0) return null;
  let best = projects[0];
  for (const p of projects) {
    if (
      p.createdAt < best.createdAt ||
      (p.createdAt === best.createdAt && p.id < best.id)
    ) {
      best = p;
    }
  }
  return best.id;
}

/** Whether `id` is the (undeletable) default project of `projects`. */
export function isDefaultProject(id: string, projects: Project[]): boolean {
  return defaultProjectId(projects) === id;
}

/**
 * A recommended color for a new project: the first hue in PROJECT_COLORS not
 * already used (AC: "미사용 색을 기본 추천값으로 제시"). Falls back to the first
 * hue once all 8 are in use. Comparison is case-insensitive.
 */
export function unusedProjectColor(projects: Pick<Project, "color">[]): string {
  const used = new Set(projects.map((p) => p.color.toUpperCase()));
  const free = PROJECT_COLORS.find((c) => !used.has(c.color.toUpperCase()));
  return (free ?? PROJECT_COLORS[0]).color;
}

/** The `order` value for a newly appended project (one past the current max). */
export function nextProjectOrder(projects: Pick<Project, "order">[]): number {
  return projects.reduce((max, p) => Math.max(max, p.order + 1), 0);
}

/**
 * Reorder projects by moving the dragged project (`fromId`) to the slot held by
 * the drop target (`toId`), then renumber every `order` to its new index
 * (0..n-1) so the array sequence and the stored order stay in lockstep (US-018).
 *
 * The move is directional, matching the drag gesture: dragging forward lands the
 * project just after the target, dragging backward lands it just before — which
 * falls out naturally from inserting at the target's original index after the
 * source is spliced out. Unrelated projects keep their relative order.
 *
 * Returns the input array unchanged (same reference) on a no-op — same id, or an
 * id not present — so callers can skip the write.
 */
export function reorderProjects(
  projects: Project[],
  fromId: string,
  toId: string,
): Project[] {
  if (fromId === toId) return projects;
  const fromIndex = projects.findIndex((p) => p.id === fromId);
  const toIndex = projects.findIndex((p) => p.id === toId);
  if (fromIndex === -1 || toIndex === -1) return projects;

  const next = [...projects];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  // Renumber to the new sequence; keep referential identity where order is same.
  return next.map((p, i) => (p.order === i ? p : { ...p, order: i }));
}
