/**
 * Marker grouping for calendar rendering (US-017).
 *
 * Point-date markers (event / hard deadline) are shown as monochrome chips on
 * their day cell. The calendar needs them keyed by date; within a date deadlines
 * sort before events (the more urgent mark reads first), then by creation time
 * for a stable order. Pure + tested so the view stays a thin renderer.
 */
import type { DateString, Marker } from "@/lib/types";

/** Deadline before event; ties broken by createdAt ascending. */
function compareMarkers(a: Marker, b: Marker): number {
  if (a.kind !== b.kind) return a.kind === "deadline" ? -1 : 1;
  return a.createdAt - b.createdAt;
}

/** Group markers by their `date`, each bucket sorted (deadlines first). */
export function groupMarkersByDate(markers: Marker[]): Map<DateString, Marker[]> {
  const byDate = new Map<DateString, Marker[]>();
  for (const m of markers) {
    const list = byDate.get(m.date);
    if (list) list.push(m);
    else byDate.set(m.date, [m]);
  }
  for (const list of byDate.values()) list.sort(compareMarkers);
  return byDate;
}

/**
 * Plan the "markers gain a required projectId" migration (US-021 AC4).
 *
 * Markers used to have no owning project (projectId was unset in v1). Any marker
 * that still lacks one is assigned to the default project. Pure (the default id
 * is injected) so the Dexie upgrade and unit tests share one path; markers that
 * already have a project are left untouched. Returns the relinks to apply.
 */
export function planMarkerScopeMigration(
  markers: { id: string; projectId?: string }[],
  defaultProjectId: string,
): { id: string; projectId: string }[] {
  return markers
    .filter((m) => !m.projectId)
    .map((m) => ({ id: m.id, projectId: defaultProjectId }));
}
