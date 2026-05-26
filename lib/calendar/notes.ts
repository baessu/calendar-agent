/**
 * Task-note helpers (US-019).
 *
 * A task may carry an optional free-text `note`. These pure helpers decide when
 * a note "counts" (drives the small bar / list indicator) and gather the tasks
 * whose note should appear in a printed snapshot.
 */
import type { DateString, Task } from "@/lib/types";
import { parseDate } from "./dates";

/** True if the task carries a non-empty note (whitespace-only counts as none). */
export function hasNote(task: Pick<Task, "note">): boolean {
  return !!task.note && task.note.trim().length > 0;
}

/**
 * Tasks carrying a note whose span overlaps [start, end] inclusive, sorted by
 * start date ascending then title. Feeds the print "메모" appendix so a printed
 * month range includes the note text of every task it shows (US-019 AC4).
 */
export function tasksWithNotesInRange(
  tasks: Task[],
  start: DateString,
  end: DateString,
): Task[] {
  const lo = parseDate(start);
  const hi = parseDate(end);
  return tasks
    .filter(
      (t) =>
        hasNote(t) && parseDate(t.endDate) >= lo && parseDate(t.startDate) <= hi,
    )
    .sort(
      (a, b) =>
        parseDate(a.startDate) - parseDate(b.startDate) ||
        a.title.localeCompare(b.title),
    );
}
