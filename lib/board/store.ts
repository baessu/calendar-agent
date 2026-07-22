/**
 * Browser-local persistence for the board: the last-loaded snapshot (so the
 * board can paint instantly on open, before Notion responds) and the user's
 * cluster layout (drag positions). Both live in localStorage — this is the
 * owner's own data on their own device, consistent with the app's local-first
 * calendar store.
 *
 * All reads/writes are guarded and swallow errors: a private-mode browser or a
 * full quota must degrade to "no cache", never throw and break the board.
 */
import type { BoardData } from "./types";
import type { Point } from "./layout";

const SNAPSHOT_KEY = "board-snapshot-v1";
const LAYOUT_KEY = "board-layout-v1";

function readJSON<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode — caching is best-effort */
  }
}

/** Last board snapshot shown, or null. Shape-checked before it's trusted. */
export function readSnapshot(): BoardData | null {
  const d = readJSON<BoardData>(SNAPSHOT_KEY);
  if (!d || !Array.isArray(d.groups) || typeof d.total !== "number") return null;
  return d;
}

export function writeSnapshot(data: BoardData): void {
  writeJSON(SNAPSHOT_KEY, data);
}

/** Saved cluster positions keyed by project name (may be empty). */
export function readLayout(): Record<string, Point> {
  return readJSON<Record<string, Point>>(LAYOUT_KEY) ?? {};
}

export function writeLayout(layout: Record<string, Point>): void {
  writeJSON(LAYOUT_KEY, layout);
}
