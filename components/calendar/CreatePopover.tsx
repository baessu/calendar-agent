"use client";

/**
 * Creation popover (US-004 shell).
 *
 * Opens when a drag-selection (or single-cell click) is committed, prefilled
 * with the chosen date range. For now it only shows the range and closes on
 * ESC / outside click — the title field + project/task-type pickers + save
 * land in US-005, which extends this component.
 *
 * No shadow (Swiss editorial = hairlines only); a transparent backdrop catches
 * outside clicks. Positioned near the pointer-release point, clamped to the
 * viewport.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DateString } from "@/lib/types";
import { formatRangeLabel } from "@/lib/calendar/selection";

interface CreatePopoverProps {
  start: DateString;
  end: DateString;
  /** Pointer-release viewport coordinates used to anchor the card. */
  x: number;
  y: number;
  onClose: () => void;
}

const MARGIN = 12;

export function CreatePopover({ start, end, x, y, onClose }: CreatePopoverProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Clamp the card inside the viewport once its real size is known.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = Math.max(MARGIN, Math.min(x, window.innerWidth - width - MARGIN));
    const top = Math.max(MARGIN, Math.min(y, window.innerHeight - height - MARGIN));
    setPos({ left, top });
  }, [x, y]);

  // ESC closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="cp-backdrop" onPointerDown={onClose}>
      <div
        ref={cardRef}
        className="create-pop"
        style={{ left: pos.left, top: pos.top }}
        role="dialog"
        aria-label="새 할일"
        // Keep clicks inside the card from reaching the backdrop.
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="cp-head">
          <span className="cp-title">새 할일</span>
          <button type="button" className="cp-x" aria-label="닫기" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="cp-range">{formatRangeLabel(start, end)}</div>
      </div>
    </div>
  );
}
