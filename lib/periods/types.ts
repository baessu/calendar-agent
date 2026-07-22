/**
 * Project period — an app-only date range for a project, drawn as a bar on the
 * month calendar. Deliberately NOT written to Notion (the user's decision): the
 * period lives only in the calendar app. A period's `project` is a Notion
 * `Project` name (e.g. "MDT"), which is how its child tasks are matched — a
 * board task belongs to a period when their project names are equal.
 *
 * Stored per-device (localStorage) for now, like the board's cache/layout;
 * this keeps the feature self-contained and off the account-sync surface.
 */

/** A calendar date as "YYYY-MM-DD" (no time, no timezone) — matches lib/types. */
export type DateString = string;

export interface ProjectPeriod {
  /** Stable local id. */
  id: string;
  /** Notion `Project` name this period represents (child tasks match on it). */
  project: string;
  /** Inclusive span, "YYYY-MM-DD". */
  startDate: DateString;
  endDate: DateString;
  /** When this row was last edited (local ordering only). */
  updatedAt: number;
}

/** Fields supplied when creating a period (id/updatedAt generated). */
export type ProjectPeriodInput = Omit<ProjectPeriod, "id" | "updatedAt">;
