"use client";

/**
 * Affinity-diagram canvas — a zoomable / pannable 2D board of project clusters,
 * ported from the original cockpit.html but data-driven (Notion) and monochrome.
 *
 * Clusters are absolutely positioned and DRAGGABLE by their header, so the user
 * arranges projects spatially like a real affinity diagram; positions persist
 * to localStorage. Unmoved clusters get a deterministic default packing. A note
 * grid widens with task count so clusters vary in size. Disposition is a
 * grayscale paper shade (.bd-card[data-tier]), never hue — color stays for the
 * calendar's data.
 *
 * Pan/zoom and cluster-drag are applied imperatively (ref + style) so a gesture
 * doesn't re-render the tree every frame; React state holds only the zoom label
 * and the committed cluster positions. One pointer pipeline dispatches between
 * three intents: drag a cluster (pointer started on a header), pan the canvas
 * (empty space), or tap a card (small movement, no drag).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BoardGroup, BoardTask, Disposition } from "@/lib/board/types";
import {
  clusterColumns,
  defaultPositions,
  estimateClusterSize,
  worldBounds,
  type Point,
} from "@/lib/board/layout";
import { readLayout, writeLayout } from "@/lib/board/store";
import { dispositionLabel, dispositionTier, formatEstimate } from "./disposition";

const MIN_SCALE = 0.2;
const MAX_SCALE = 2.2;
const TAP_SLOP = 5; // px of movement below which a pointer up counts as a tap

interface BoardCanvasProps {
  groups: BoardGroup[];
  dispOf: (t: BoardTask) => Disposition;
  onOpenMenu: (m: { task: BoardTask; x: number; y: number }) => void;
}

export function BoardCanvas({ groups, dispOf, onOpenMenu }: BoardCanvasProps) {
  const vpRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  // Live transform kept in a ref (mutated every pan frame without re-render).
  const view = useRef({ scale: 1, tx: 0, ty: 0 });
  const [zoomPct, setZoomPct] = useState(100);

  // Deterministic seed layout (same on server + client → no hydration jump).
  const defaults = useMemo(
    () => defaultPositions(groups.map((g) => ({ project: g.project, count: g.tasks.length }))),
    [groups],
  );
  // User's saved drag positions. Safe to read from storage in the initializer:
  // BoardCanvas is only mounted client-side (after BoardApp has data), so it
  // never server-renders and can't cause a hydration mismatch.
  const [overrides, setOverrides] = useState<Record<string, Point>>(readLayout);

  const posOf = useCallback(
    (project: string): Point => overrides[project] ?? defaults[project] ?? { x: 20, y: 20 },
    [overrides, defaults],
  );

  // World size = box that frames every cluster at its current position.
  const world = useMemo(() => {
    const placed = groups.map((g) => ({
      pos: overrides[g.project] ?? defaults[g.project] ?? { x: 20, y: 20 },
      size: estimateClusterSize(g.tasks.length),
    }));
    return worldBounds(placed);
  }, [groups, overrides, defaults]);

  const apply = useCallback(() => {
    const w = worldRef.current;
    if (!w) return;
    const { scale, tx, ty } = view.current;
    w.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }, []);

  const setZoomLabel = useCallback(() => {
    setZoomPct(Math.round(view.current.scale * 100));
  }, []);

  const zoomAt = useCallback(
    (cx: number, cy: number, factor: number) => {
      const v = view.current;
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
      if (next === v.scale) return;
      v.tx = cx - (cx - v.tx) * (next / v.scale);
      v.ty = cy - (cy - v.ty) * (next / v.scale);
      v.scale = next;
      apply();
      setZoomLabel();
    },
    [apply, setZoomLabel],
  );

  const fit = useCallback(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const pad = 40;
    const bw = world.w || 1;
    const bh = world.h || 1;
    const s = Math.min(
      (vp.clientWidth - pad * 2) / bw,
      (vp.clientHeight - pad * 2) / bh,
      1,
    );
    const v = view.current;
    v.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
    v.tx = (vp.clientWidth - bw * v.scale) / 2;
    v.ty = Math.max(pad, (vp.clientHeight - bh * v.scale) / 2);
    apply();
    setZoomLabel();
  }, [apply, setZoomLabel, world]);

  // Fit on first layout and whenever the group set changes (not on every drag).
  const groupsKey = groups.map((g) => g.project).join("|");
  useEffect(() => {
    const id = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refit only on group-set change
  }, [groupsKey]);

  // Wheel: ctrl/plain → zoom at cursor; shift → horizontal pan; trackpad → pan.
  useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      const cx = e.clientX - r.left;
      const cy = e.clientY - r.top;
      if (e.ctrlKey) {
        zoomAt(cx, cy, Math.exp(-e.deltaY * 0.01));
      } else if (e.shiftKey) {
        view.current.tx -= e.deltaY;
        apply();
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        view.current.tx -= e.deltaX;
        view.current.ty -= e.deltaY;
        apply();
      } else {
        zoomAt(cx, cy, Math.exp(-e.deltaY * 0.0022));
      }
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [zoomAt, apply]);

  // ── One pointer pipeline: cluster-drag | pan | (card tap handled by click) ──
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const panFrom = useRef<{ x: number; y: number } | null>(null);
  const pinchDist = useRef(0);
  const moved = useRef(0);
  const panned = useRef(false);
  // Active cluster drag, if any.
  const drag = useRef<{
    project: string;
    el: HTMLElement;
    startX: number;
    startY: number;
    from: Point;
  } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest(".bd-hud")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = 0;
    panned.current = false;

    const head = target.closest<HTMLElement>(".bd-cluster-head");
    if (head && pointers.current.size === 1) {
      // Drag this cluster, not the canvas.
      const el = head.closest<HTMLElement>(".bd-cluster");
      const project = el?.dataset.project;
      if (el && project) {
        drag.current = {
          project,
          el,
          startX: e.clientX,
          startY: e.clientY,
          from: posOf(project),
        };
        panFrom.current = null;
        return;
      }
    }

    if (pointers.current.size === 1) {
      panFrom.current = { x: e.clientX - view.current.tx, y: e.clientY - view.current.ty };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchDist.current = Math.hypot(a.x - b.x, a.y - b.y);
      panFrom.current = null;
      drag.current = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointers.current;
    if (!p.has(e.pointerId)) return;
    p.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const d = drag.current;
    if (d) {
      // Move in world space: screen delta ÷ scale.
      const s = view.current.scale;
      d.el.style.left = `${d.from.x + (e.clientX - d.startX) / s}px`;
      d.el.style.top = `${d.from.y + (e.clientY - d.startY) / s}px`;
      return;
    }

    if (p.size === 2) {
      const [a, b] = [...p.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist.current > 0) {
        const r = vpRef.current!.getBoundingClientRect();
        zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, dist / pinchDist.current);
      }
      pinchDist.current = dist;
      panned.current = true;
    } else if (panFrom.current) {
      const nx = e.clientX - panFrom.current.x;
      const ny = e.clientY - panFrom.current.y;
      moved.current += Math.hypot(nx - view.current.tx, ny - view.current.ty);
      view.current.tx = nx;
      view.current.ty = ny;
      apply();
      if (moved.current > TAP_SLOP) panned.current = true;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const d = drag.current;
    if (d) {
      const x = parseFloat(d.el.style.left) || d.from.x;
      const y = parseFloat(d.el.style.top) || d.from.y;
      drag.current = null;
      // Commit only if it actually moved, so a header click isn't a no-op write.
      if (x !== d.from.x || y !== d.from.y) {
        setOverrides((prev) => {
          const next = { ...prev, [d.project]: { x, y } };
          writeLayout(next);
          return next;
        });
      }
    }
    if (pointers.current.size < 2) pinchDist.current = 0;
    if (pointers.current.size === 0) panFrom.current = null;
  };

  const openFor = (task: BoardTask, el: HTMLElement) => {
    if (panned.current) return; // the gesture was a pan, not a tap
    const r = el.getBoundingClientRect();
    onOpenMenu({ task, x: r.right - 6, y: r.top + 6 });
  };

  const half = (n: number) => n / 2;

  return (
    <div
      ref={vpRef}
      className="bd-vp"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        ref={worldRef}
        className="bd-world"
        style={{ width: world.w, height: world.h }}
      >
        {groups.map((g) => {
          const pos = posOf(g.project);
          return (
            <Cluster
              key={g.project}
              group={g}
              left={pos.x}
              top={pos.y}
              dispOf={dispOf}
              onOpen={openFor}
            />
          );
        })}
      </div>

      <div className="bd-hud">
        <button type="button" aria-label="축소" onClick={() => zoomAt(half(vw(vpRef)), half(vh(vpRef)), 0.8)}>
          −
        </button>
        <span className="bd-zoom">{zoomPct}%</span>
        <button type="button" aria-label="확대" onClick={() => zoomAt(half(vw(vpRef)), half(vh(vpRef)), 1.25)}>
          +
        </button>
        <button type="button" className="bd-hud-wide" onClick={fit}>
          전체
        </button>
      </div>
    </div>
  );
}

function Cluster({
  group,
  left,
  top,
  dispOf,
  onOpen,
}: {
  group: BoardGroup;
  left: number;
  top: number;
  dispOf: (t: BoardTask) => Disposition;
  onOpen: (task: BoardTask, el: HTMLElement) => void;
}) {
  const cols = clusterColumns(group.tasks.length);
  return (
    <section
      className="bd-cluster"
      data-project={group.project}
      style={{ left, top, width: cols * 168 + 40 }}
    >
      <div className="bd-cluster-head" title="드래그해서 옮기기">
        <span className="bd-drag" aria-hidden>
          ⠿
        </span>
        <h2 className="bd-cluster-name">{group.project}</h2>
        <span className="bd-cluster-count">{group.tasks.length}</span>
      </div>
      <div className="bd-cluster-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {group.tasks.map((t) => (
          <Card key={t.id} task={t} disposition={dispOf(t)} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

function Card({
  task,
  disposition,
  onOpen,
}: {
  task: BoardTask;
  disposition: Disposition;
  onOpen: (task: BoardTask, el: HTMLElement) => void;
}) {
  const est = formatEstimate(task.estMinutes);
  return (
    <article
      className="bd-card"
      data-tier={dispositionTier(disposition)}
      tabIndex={0}
      role="button"
      aria-label={`${task.title} — 처분: ${dispositionLabel(disposition)}. 눌러서 변경`}
      onClick={(e) => onOpen(task, e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(task, e.currentTarget);
        }
      }}
    >
      <div className="bd-card-top">
        <span className="bd-disp">{dispositionLabel(disposition)}</span>
        {task.status && task.status !== "Not started" && (
          <span className="bd-status">{task.status}</span>
        )}
      </div>
      <div className="bd-card-title">{task.title}</div>
      {(task.due || est || task.delegate) && (
        <div className="bd-card-meta">
          {task.due && <span>{task.due}</span>}
          {est && <span>{est}</span>}
          {task.delegate && <span>{task.delegate}</span>}
        </div>
      )}
    </article>
  );
}

const vw = (r: React.RefObject<HTMLDivElement | null>) => r.current?.clientWidth ?? 0;
const vh = (r: React.RefObject<HTMLDivElement | null>) => r.current?.clientHeight ?? 0;
