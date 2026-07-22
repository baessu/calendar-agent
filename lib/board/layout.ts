/**
 * Pure geometry for the affinity canvas — cluster sizing, default packing, and
 * world bounds. No DOM, no storage; the canvas component owns those. Kept pure
 * so the layout math is unit-testable (project convention: pure logic + tests,
 * see lib/board/transform.ts).
 *
 * Coordinates are world-space pixels (pre pan/zoom). Cluster heights are
 * ESTIMATED from task count rather than measured — good enough to seed a
 * non-overlapping default layout and to size the world; the user then drags
 * clusters wherever they like and those positions are persisted.
 */

export interface Size {
  w: number;
  h: number;
}
export interface Point {
  x: number;
  y: number;
}

/** One card's approximate rendered height (title + meta + padding), px. */
const CARD_H = 74;
const CLUSTER_HEAD_H = 44;
const CLUSTER_PAD_V = 18;
const COL_W = 168; // must match BoardCanvas's inline cluster width formula

/** Note-grid column count grows with task count, so clusters vary in width. */
export function clusterColumns(count: number): number {
  if (count <= 2) return 1;
  if (count <= 6) return 2;
  return 3;
}

/** Estimated cluster box size from its task count. */
export function estimateClusterSize(count: number): Size {
  const cols = clusterColumns(count);
  const rows = Math.max(1, Math.ceil(count / cols));
  return {
    w: cols * COL_W + 40,
    h: CLUSTER_HEAD_H + rows * CARD_H + CLUSTER_PAD_V,
  };
}

export interface ClusterMeta {
  project: string;
  count: number;
}

/**
 * Seed positions: pack clusters left→right, wrapping to a new row when the next
 * one would exceed `maxWidth`. Deterministic (same input → same output) so
 * server and client first-render match; user drags then override these.
 */
export function defaultPositions(
  clusters: ClusterMeta[],
  maxWidth = 1120,
  gap = 26,
  pad = 20,
): Record<string, Point> {
  const out: Record<string, Point> = {};
  let x = pad;
  let y = pad;
  let rowH = 0;
  for (const c of clusters) {
    const size = estimateClusterSize(c.count);
    // Wrap (but never on the first item in a row, or a wide cluster loops).
    if (x > pad && x + size.w > maxWidth) {
      x = pad;
      y += rowH + gap;
      rowH = 0;
    }
    out[c.project] = { x, y };
    x += size.w + gap;
    rowH = Math.max(rowH, size.h);
  }
  return out;
}

/** The world size that frames every placed cluster, plus padding. */
export function worldBounds(
  placed: { pos: Point; size: Size }[],
  pad = 60,
): Size {
  let maxR = 0;
  let maxB = 0;
  for (const { pos, size } of placed) {
    maxR = Math.max(maxR, pos.x + size.w);
    maxB = Math.max(maxB, pos.y + size.h);
  }
  return { w: maxR + pad, h: maxB + pad };
}
