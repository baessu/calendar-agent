/**
 * Share snapshot serialization (US-023).
 *
 * A share publishes a single project as a self-contained, JSON-serializable
 * snapshot: the project identity plus its own tasks (with notes), task types,
 * and markers, and the month range to render. Pure + side-effect free so it can
 * be unit tested and run on either side; the React layer builds it from
 * IndexedDB, the API route writes it to Blob, and the public page parses it.
 *
 * Local-first stays: a snapshot is a point-in-time copy, never the live store.
 */
import type { YearMonth } from "@/lib/calendar/infinite";
import type { DateString, Marker, Project, Task, TaskType } from "@/lib/types";

/** Current snapshot schema version (bump on a breaking shape change). */
export const SNAPSHOT_VERSION = 1 as const;

/** A published, read-only copy of one project's calendar. */
export interface ShareSnapshot {
  v: typeof SNAPSHOT_VERSION;
  /** When this snapshot was published/refreshed (epoch ms). */
  publishedAt: number;
  /** Project identity (only the fields the public render needs). */
  project: { id: string; name: string; color: string };
  /** This project's task types (tones). */
  taskTypes: TaskType[];
  /** This project's tasks, including notes. */
  tasks: Task[];
  /** This project's markers (events / deadlines). */
  markers: Marker[];
  /** Inclusive month range to render (1-based). */
  range: { from: YearMonth; to: YearMonth };
}

/** The 1-based {year, month} a "YYYY-MM-DD" date falls in. */
export function monthOf(date: DateString): YearMonth {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) };
}

/**
 * The month range that covers every task span and marker. Empty data falls
 * back to the single month of `now` so the snapshot still renders one grid.
 * Dates are "YYYY-MM-DD", which sort lexicographically, so min/max are string
 * comparisons.
 */
export function computeRange(
  tasks: Pick<Task, "startDate" | "endDate">[],
  markers: Pick<Marker, "date">[],
  now: Date = new Date(),
): { from: YearMonth; to: YearMonth } {
  const lows: DateString[] = [];
  const highs: DateString[] = [];
  for (const t of tasks) {
    lows.push(t.startDate);
    highs.push(t.endDate);
  }
  for (const m of markers) {
    lows.push(m.date);
    highs.push(m.date);
  }
  if (lows.length === 0) {
    const ym = { year: now.getFullYear(), month: now.getMonth() + 1 };
    return { from: ym, to: ym };
  }
  lows.sort();
  highs.sort();
  return { from: monthOf(lows[0]), to: monthOf(highs[highs.length - 1]) };
}

/**
 * Build a project's snapshot from the full local data set (filters to the
 * project). `now` is injectable for deterministic tests.
 */
export function buildSnapshot(
  project: Project,
  allTaskTypes: TaskType[],
  allTasks: Task[],
  allMarkers: Marker[],
  now: Date = new Date(),
): ShareSnapshot {
  const taskTypes = allTaskTypes
    .filter((tt) => tt.projectId === project.id)
    .sort((a, b) => a.order - b.order);
  const tasks = allTasks
    .filter((t) => t.projectId === project.id)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const markers = allMarkers.filter((m) => m.projectId === project.id);
  return {
    v: SNAPSHOT_VERSION,
    publishedAt: now.getTime(),
    project: { id: project.id, name: project.name, color: project.color },
    taskTypes,
    tasks,
    markers,
    range: computeRange(tasks, markers, now),
  };
}

/** Whether a value looks like a 1-based YearMonth. */
function isYearMonth(v: unknown): v is YearMonth {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as YearMonth).year === "number" &&
    typeof (v as YearMonth).month === "number"
  );
}

/**
 * Validate + narrow an unknown (parsed-JSON) value to a ShareSnapshot, or null
 * if it's malformed or a version we don't understand. The public page uses this
 * to fall back to the "not found" state instead of throwing.
 */
export function parseSnapshot(raw: unknown): ShareSnapshot | null {
  if (typeof raw !== "object" || raw === null) return null;
  const s = raw as Partial<ShareSnapshot>;
  if (s.v !== SNAPSHOT_VERSION) return null;
  if (
    typeof s.project !== "object" ||
    s.project === null ||
    typeof s.project.id !== "string" ||
    typeof s.project.name !== "string" ||
    typeof s.project.color !== "string"
  ) {
    return null;
  }
  if (
    !Array.isArray(s.taskTypes) ||
    !Array.isArray(s.tasks) ||
    !Array.isArray(s.markers)
  ) {
    return null;
  }
  if (
    typeof s.range !== "object" ||
    s.range === null ||
    !isYearMonth(s.range.from) ||
    !isYearMonth(s.range.to)
  ) {
    return null;
  }
  if (typeof s.publishedAt !== "number") return null;
  return s as ShareSnapshot;
}
