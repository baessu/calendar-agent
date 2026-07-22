/**
 * Lane stacking for week segments (pure logic, unit-tested) — US-007.
 *
 * Within a week row, bars whose column spans overlap must sit on separate
 * vertical lanes so none are hidden; non-overlapping bars reuse a lane to save
 * space (greedy interval scheduling — assign to the first lane that is free,
 * which yields the minimum number of lanes for an interval graph). When more
 * lanes are needed than `maxLanes`, the extra bars are summarized as per-column
 * "+N" overflow chips that the UI expands on click.
 */
import type { Task } from "@/lib/types";
import type { HasSpan, WeekSegment } from "./segments";

/** Default number of lanes shown before bars collapse into "+N" chips. */
export const DEFAULT_MAX_LANES = 3;

/** A segment with its assigned vertical lane (0-based, top = lane 0). */
export interface PlacedSegment<T extends HasSpan = Task> extends WeekSegment<T> {
  lane: number;
}

/** A "+N" overflow chip for one column when the row is collapsed. */
export interface OverflowChip {
  /** Column 0 (Sun) .. 6 (Sat) the chip sits in. */
  col: number;
  /** How many hidden bars (lane >= maxLanes) cover this column. */
  count: number;
}

export interface WeekLayout<T extends HasSpan = Task> {
  /** Every segment with its lane assignment (full — ignores maxLanes). */
  segments: PlacedSegment<T>[];
  /** Total lanes used by all segments. */
  laneCount: number;
  /** Per-column overflow chips for lanes >= maxLanes; empty if nothing overflows. */
  overflow: OverflowChip[];
}

/**
 * Assign each segment a lane via greedy interval scheduling. Input order decides
 * tie-breaking; `weekSegments` already sorts by start column (longer span first),
 * which keeps placement stable. Two segments overlap when their inclusive
 * [startCol, endCol] ranges intersect (touching at a column counts as overlap).
 */
export function layoutWeek<T extends HasSpan = Task>(
  segments: WeekSegment<T>[],
  maxLanes: number = DEFAULT_MAX_LANES,
): WeekLayout<T> {
  // laneEnd[i] = last column occupied in lane i. A segment reuses a lane only
  // when it starts strictly after that lane's current end (no overlap).
  const laneEnd: number[] = [];
  const placed: PlacedSegment<T>[] = segments.map((seg) => {
    let lane = laneEnd.findIndex((end) => end < seg.startCol);
    if (lane === -1) {
      lane = laneEnd.length;
      laneEnd.push(seg.endCol);
    } else {
      laneEnd[lane] = seg.endCol;
    }
    return { ...seg, lane };
  });

  // Columns covered by overflowing lanes (>= maxLanes) get a "+N" chip.
  const counts = new Array<number>(7).fill(0);
  for (const seg of placed) {
    if (seg.lane < maxLanes) continue;
    for (let c = seg.startCol; c <= seg.endCol; c++) counts[c]++;
  }
  const overflow: OverflowChip[] = [];
  for (let c = 0; c < 7; c++) {
    if (counts[c] > 0) overflow.push({ col: c, count: counts[c] });
  }

  return { segments: placed, laneCount: laneEnd.length, overflow };
}
