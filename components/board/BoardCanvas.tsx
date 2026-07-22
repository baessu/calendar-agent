"use client";

/**
 * Affinity-diagram canvas — a zoomable / pannable 2D board of project clusters,
 * ported from the original cockpit.html but data-driven (Notion) and monochrome.
 *
 * Each project is a bordered cluster whose note grid widens with its task count
 * (1 col → 3 cols), so clusters have varied sizes and flow-pack like real
 * affinity groups rather than uniform kanban columns. Disposition is conveyed
 * by a grayscale paper shade (see .bd-card[data-tier] in globals.css), never
 * hue — color stays reserved for the calendar's data.
 *
 * Pan/zoom is applied imperatively to the world element (ref + style.transform)
 * so a drag doesn't re-render the whole tree every frame; only the zoom% label
 * is React state. A small drag threshold distinguishes a pan from a card tap.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardGroup, BoardTask, Disposition } from "@/lib/board/types";
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
      // Keep the point under the cursor fixed while scaling.
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
    const world = worldRef.current;
    if (!vp || !world) return;
    const pad = 40;
    // offsetWidth/Height are the untransformed layout size.
    const bw = world.offsetWidth || 1;
    const bh = world.offsetHeight || 1;
    const s = Math.min(
      (vp.clientWidth - pad * 2) / bw,
      (vp.clientHeight - pad * 2) / bh,
      1, // never blow small boards up past 100%
    );
    const v = view.current;
    v.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
    v.tx = (vp.clientWidth - bw * v.scale) / 2;
    v.ty = Math.max(pad, (vp.clientHeight - bh * v.scale) / 2);
    apply();
    setZoomLabel();
  }, [apply, setZoomLabel]);

  // Fit once the clusters have laid out (and whenever the group set changes).
  useEffect(() => {
    const id = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(id);
  }, [fit, groups]);

  // Wheel: ctrl/plain → zoom at cursor; shift → horizontal pan; trackpad 2-axis
  // → pan. Native listener with { passive:false } so we can preventDefault.
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

  // Pointer pan + pinch. `panned` suppresses the card click after a drag.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const panFrom = useRef<{ x: number; y: number } | null>(null);
  const pinchDist = useRef(0);
  const moved = useRef(0);
  const panned = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest(".bd-hud")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = 0;
    panned.current = false;
    if (pointers.current.size === 1) {
      panFrom.current = { x: e.clientX - view.current.tx, y: e.clientY - view.current.ty };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchDist.current = Math.hypot(a.x - b.x, a.y - b.y);
      panFrom.current = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointers.current;
    if (!p.has(e.pointerId)) return;
    p.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (p.size === 2) {
      const [a, b] = [...p.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist.current > 0) {
        const r = vpRef.current!.getBoundingClientRect();
        zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, d / pinchDist.current);
      }
      pinchDist.current = d;
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
    if (pointers.current.size < 2) pinchDist.current = 0;
    if (pointers.current.size === 0) panFrom.current = null;
  };

  // Card activation — ignored if the gesture was a pan (panned flag).
  const openFor = (task: BoardTask, el: HTMLElement) => {
    if (panned.current) return;
    const r = el.getBoundingClientRect();
    onOpenMenu({ task, x: r.right - 6, y: r.top + 6 });
  };

  return (
    <div
      ref={vpRef}
      className="bd-vp"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div ref={worldRef} className="bd-world">
        {groups.map((g) => (
          <Cluster key={g.project} group={g} dispOf={dispOf} onOpen={openFor} />
        ))}
      </div>

      <div className="bd-hud">
        <button type="button" aria-label="축소" onClick={() => zoomAt(innerW(vpRef) / 2, innerH(vpRef) / 2, 0.8)}>
          −
        </button>
        <span className="bd-zoom">{zoomPct}%</span>
        <button type="button" aria-label="확대" onClick={() => zoomAt(innerW(vpRef) / 2, innerH(vpRef) / 2, 1.25)}>
          +
        </button>
        <button type="button" className="bd-hud-wide" onClick={fit}>
          전체
        </button>
      </div>
    </div>
  );
}

/** Note grid columns scale with task count, so clusters vary in width. */
function columnsFor(count: number): number {
  if (count <= 2) return 1;
  if (count <= 6) return 2;
  return 3;
}

function Cluster({
  group,
  dispOf,
  onOpen,
}: {
  group: BoardGroup;
  dispOf: (t: BoardTask) => Disposition;
  onOpen: (task: BoardTask, el: HTMLElement) => void;
}) {
  const cols = columnsFor(group.tasks.length);
  return (
    <section className="bd-cluster" style={{ width: cols * 168 + 40 }}>
      <div className="bd-cluster-head">
        <h2 className="bd-cluster-name">{group.project}</h2>
        <span className="bd-cluster-count">{group.tasks.length}</span>
      </div>
      <div
        className="bd-cluster-grid"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
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

const innerW = (r: React.RefObject<HTMLDivElement | null>) => r.current?.clientWidth ?? 0;
const innerH = (r: React.RefObject<HTMLDivElement | null>) => r.current?.clientHeight ?? 0;
