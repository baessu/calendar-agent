/**
 * Pure archive helpers for projects & task types.
 *
 * Archiving is a soft "put away": an archived row keeps all its data but is
 * hidden from normal views (tabs, pickers, lists) until restored. A row is
 * archived when `archivedAt` is a truthy timestamp; restoring sets it to 0, so
 * `!archivedAt` is the single "active" test everywhere.
 */

/** Anything that can be archived carries an optional archive timestamp. */
export interface Archivable {
  archivedAt?: number;
}

/** Whether a row is archived (put away). 0 / absent = active. */
export function isArchived(row: Archivable): boolean {
  return !!row.archivedAt;
}

/** Only the active (non-archived) rows, order preserved. */
export function activeOnly<T extends Archivable>(rows: T[]): T[] {
  return rows.filter((r) => !r.archivedAt);
}

/** Only the archived rows, most-recently-archived first (for the restore list). */
export function archivedOnly<T extends Archivable>(rows: T[]): T[] {
  return rows
    .filter((r) => !!r.archivedAt)
    .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));
}
