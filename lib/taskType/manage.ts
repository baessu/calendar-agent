/**
 * Pure helpers for task-type management (US-012).
 *
 * Task types are globally shared (one set across all projects) and define the
 * tone (dark/tint, k) applied over a project color. Kept side-effect-free so
 * they can be unit tested; the React layer wires these into create/rename/
 * retone/delete flows. Tone values come from docs/design/color-system.md via
 * TASK_TYPE_TONES (never invented here).
 */
import { TONE_LADDER } from "@/lib/color/tokens";
import type { TaskType, ToneMode } from "@/lib/types";

/** Recommended number of tone steps before tones get hard to tell apart (§7). */
export const RECOMMENDED_TASK_TYPE_MAX = 8;

/** A selectable tone step (mode + strength) from the confirmed ladder. */
export interface ToneStep {
  mode: ToneMode;
  k: number;
}

/** The 8 confirmed tone steps, darkest → lightest (color-system.md §3). */
export const TONE_STEPS: ToneStep[] = TONE_LADDER.map((t) => ({
  mode: t.mode,
  k: t.k,
}));

/**
 * The protected "default" task type: it cannot be deleted, and tasks of a
 * deleted type are reassigned to it. Defined as the smallest `order` (the
 * seeded "리서치" = order 0), with createdAt then id as stable tiebreaks. Order
 * (not createdAt) is primary because the 4 seeded types share one createdAt.
 * Returns null only when there are no task types.
 */
export function defaultTaskTypeId(taskTypes: TaskType[]): string | null {
  if (taskTypes.length === 0) return null;
  let best = taskTypes[0];
  for (const t of taskTypes) {
    if (
      t.order < best.order ||
      (t.order === best.order && t.createdAt < best.createdAt) ||
      (t.order === best.order &&
        t.createdAt === best.createdAt &&
        t.id < best.id)
    ) {
      best = t;
    }
  }
  return best.id;
}

/** Whether `id` is the (undeletable) default task type of `taskTypes`. */
export function isDefaultTaskType(id: string, taskTypes: TaskType[]): boolean {
  return defaultTaskTypeId(taskTypes) === id;
}

/** The `order` value for a newly appended task type (one past the current max). */
export function nextTaskTypeOrder(taskTypes: Pick<TaskType, "order">[]): number {
  return taskTypes.reduce((max, t) => Math.max(max, t.order + 1), 0);
}

/**
 * Whether adding another task type would exceed the recommended count (AC6:
 * "권장 단계 수(약 3~4개)를 넘으면…"). True once the current count reaches the
 * recommended max, i.e. the next one would push it past 4.
 */
export function exceedsRecommendedTaskTypes(
  currentCount: number,
  max: number = RECOMMENDED_TASK_TYPE_MAX,
): boolean {
  return currentCount >= max;
}

/** Index of the tone step matching {mode, k}, or -1 if none (custom value). */
export function toneStepIndex(mode: ToneMode, k: number): number {
  return TONE_STEPS.findIndex((s) => s.mode === mode && s.k === k);
}

/**
 * A recommended tone for a new task type: the first step not already used,
 * matching the unused-color idea from project management. Falls back to the
 * darkest step once all four are in use.
 */
export function unusedToneStep(
  taskTypes: Pick<TaskType, "mode" | "k">[],
): ToneStep {
  const used = new Set(taskTypes.map((t) => `${t.mode}:${t.k}`));
  return (
    TONE_STEPS.find((s) => !used.has(`${s.mode}:${s.k}`)) ?? TONE_STEPS[0]
  );
}
