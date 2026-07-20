/**
 * Detecting the untouched first-run seed.
 *
 * Every device seeds a default project ("기본") + its 4 task types on first
 * load, before it knows whether anyone is signed in. Without special handling,
 * signing in on a second device would push that seed as a brand-new project,
 * so each new device would silently add a duplicate "기본" to the account.
 *
 * So a device reports whether its local data is still the pristine seed. If it
 * is AND the account already has data, the server drops the pushed rows and
 * returns what it holds — the seed was never real user data, just a placeholder
 * waiting to be replaced. If the account is empty (the genuine first device),
 * the seed is pushed normally and becomes the account's starting state.
 *
 * The check is deliberately strict: any task, any marker, any deletion, a
 * renamed project, or an extra project all mean the user has touched this
 * device, and their data is then never discarded.
 */
import { DEFAULT_PROJECT_NAME, TASK_TYPE_TONES } from "@/lib/color/tokens";
import type { SyncState } from "./types";

/**
 * Whether `state` is exactly the untouched first-run seed and therefore safe to
 * discard in favour of an existing account. Returns false for anything the user
 * could plausibly have created.
 */
export function isPristineSeed(state: SyncState): boolean {
  if (state.tasks.length > 0) return false;
  if (state.markers.length > 0) return false;
  if (state.deletions.length > 0) return false;
  if (state.projects.length !== 1) return false;

  const [project] = state.projects;
  if (project.name !== DEFAULT_PROJECT_NAME) return false;

  // Exactly the seeded tone set, all owned by that one project.
  if (state.taskTypes.length !== TASK_TYPE_TONES.length) return false;
  if (!state.taskTypes.every((tt) => tt.projectId === project.id)) return false;

  const seeded = new Set(TASK_TYPE_TONES.map((t) => t.name));
  return state.taskTypes.every((tt) => seeded.has(tt.name));
}

/** Whether a state holds any rows at all (used to tell "empty account" apart). */
export function isEmptyState(state: SyncState): boolean {
  return (
    state.projects.length === 0 &&
    state.taskTypes.length === 0 &&
    state.tasks.length === 0 &&
    state.markers.length === 0
  );
}
