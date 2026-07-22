/**
 * localStorage persistence for project periods (app-only, per device).
 *
 * A thin CRUD over a single JSON array under one key. Guarded and error-
 * swallowing like lib/board/store.ts: a private-mode or full-quota browser
 * degrades to "no periods", never throws. Pure-ish — the only side effect is
 * localStorage — so the React layer can read/write through these and re-render
 * from the returned array.
 */
import type { ProjectPeriod, ProjectPeriodInput } from "./types";

const KEY = "project-periods-v1";

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `pp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** All periods, or [] if none / storage unavailable. Shape-validated. */
export function readPeriods(): ProjectPeriod[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (p): p is ProjectPeriod =>
        !!p &&
        typeof (p as ProjectPeriod).id === "string" &&
        typeof (p as ProjectPeriod).project === "string" &&
        typeof (p as ProjectPeriod).startDate === "string" &&
        typeof (p as ProjectPeriod).endDate === "string",
    );
  } catch {
    return [];
  }
}

function write(periods: ProjectPeriod[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(periods));
  } catch {
    /* quota / private mode — best-effort */
  }
}

/** Add a period; returns the full new list. Dates are normalized so start≤end. */
export function addPeriod(input: ProjectPeriodInput): ProjectPeriod[] {
  const [startDate, endDate] =
    input.startDate <= input.endDate
      ? [input.startDate, input.endDate]
      : [input.endDate, input.startDate];
  const period: ProjectPeriod = {
    ...input,
    startDate,
    endDate,
    id: newId(),
    updatedAt: Date.now(),
  };
  const next = [...readPeriods(), period];
  write(next);
  return next;
}

/** Patch a period's dates/project; returns the full new list. */
export function updatePeriod(
  id: string,
  changes: Partial<ProjectPeriodInput>,
): ProjectPeriod[] {
  const next = readPeriods().map((p) =>
    p.id === id ? normalize({ ...p, ...changes, updatedAt: Date.now() }) : p,
  );
  write(next);
  return next;
}

/** Remove a period; returns the full new list. */
export function deletePeriod(id: string): ProjectPeriod[] {
  const next = readPeriods().filter((p) => p.id !== id);
  write(next);
  return next;
}

/** Keep start ≤ end after an edit. */
function normalize(p: ProjectPeriod): ProjectPeriod {
  return p.startDate <= p.endDate
    ? p
    : { ...p, startDate: p.endDate, endDate: p.startDate };
}
