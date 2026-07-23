/**
 * Task ↔ board mapping (app-only, per device).
 *
 * Maps a calendar 일정 (a local Dexie task id) to the board/Notion tasks a
 * person has attached to it — "these board tasks belong under this schedule".
 * Stored in localStorage as { [calendarTaskId]: boardTaskId[] }; never written
 * to Notion (the user's decision — the mapping lives only in the calendar app).
 *
 * Guarded + error-swallowing like the other local stores: a private-mode or
 * full-quota browser degrades to "no mappings" rather than throwing.
 */

const KEY = "task-board-map-v1";

/** calendarTaskId → attached board task ids (Notion page ids). */
export type TaskMap = Record<string, string[]>;

/** Read the whole map, validated. `{}` if absent / storage unavailable. */
export function readMap(): TaskMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    const obj = raw ? (JSON.parse(raw) as unknown) : {};
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
    const out: TaskMap = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === "string");
    }
    return out;
  } catch {
    return {};
  }
}

/** Persist the whole map, dropping empty entries so it doesn't grow forever. */
export function writeMap(map: TaskMap): void {
  if (typeof window === "undefined") return;
  const pruned: TaskMap = {};
  for (const [k, v] of Object.entries(map)) if (v.length > 0) pruned[k] = v;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(pruned));
  } catch {
    /* quota / private mode — best-effort */
  }
}
