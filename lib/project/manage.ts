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
