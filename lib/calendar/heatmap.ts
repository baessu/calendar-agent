/**
 * Task-density heatmap (US-022).
 *
 * On the 전체(통합) view the user can shade each day cell by how many tasks
 * overlap that day ("바쁜 날이 진하게"). These pure helpers compute the per-day
 * count and bucket it into a small set of monochrome shade levels so the cells
 * and the legend stay in step. Monochrome only — color stays on the task bars.
 */
import type { DateString, Task } from "@/lib/types";
import { addDays, diffDays, parseDate, toDateString } from "./dates";

/** Per-date count of tasks whose [startDate, endDate] span covers that date. */
export type DensityMap = Map<DateString, number>;

/**
 * Count, for every date any task touches, how many tasks are active that day
 * (overlap = startDate <= day <= endDate). A task contributes +1 to each date
 * in its inclusive span; dates are walked at UTC noon (no tz drift). A reversed
 * span (end < start) is clamped to a single day so a malformed task still counts.
 */
export function taskDensityByDate(tasks: Task[]): DensityMap {
  const m: DensityMap = new Map();
  for (const t of tasks) {
    const start = parseDate(t.startDate);
    const span = Math.max(0, diffDays(start, parseDate(t.endDate)));
    for (let i = 0; i <= span; i++) {
      const date = toDateString(addDays(start, i));
      m.set(date, (m.get(date) ?? 0) + 1);
    }
  }
  return m;
}

/** Shade steps above "none" — also the legend swatch count. */
export const HEAT_LEVELS = 4;

/**
 * Bucket a density count into a shade level 0..HEAT_LEVELS, where 0 = no shade
 * and HEAT_LEVELS caps the densest days ("4개 이상"). Fixed thresholds (not
 * relative to a running max) keep the legend stable as tasks are added/removed.
 */
export function heatLevel(count: number): number {
  if (count <= 0) return 0;
  return Math.min(count, HEAT_LEVELS);
}
