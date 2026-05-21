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
