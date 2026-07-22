"use client";

/**
 * Create a project period — pick a project + a date range, added to the app's
 * local period store (never written to Notion). Project options come from the
 * board (the Notion `Project` values); if the viewer is signed out or the fetch
 * fails, the field falls back to free text so a period can still be created.
 *
 * Swiss editorial chrome (shares .create-pop / .cp-* with the calendar's other
 * popovers): hairlines, no shadow, ESC / ✕ / backdrop to close.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardData } from "@/lib/board/types";
import type { ProjectPeriodInput } from "@/lib/periods/types";

interface PeriodCreatePopoverProps {
  x: number;
  y: number;
  /** Default range to prefill (today → +14d), "YYYY-MM-DD". */
  defaultStart: string;
  defaultEnd: string;
  onAdd: (input: ProjectPeriodInput) => void;
  onClose: () => void;
}

const MARGIN = 12;

export function PeriodCreatePopover({
  x,
  y,
  defaultStart,
  defaultEnd,
  onAdd,
  onClose,
}: PeriodCreatePopoverProps) {
  const [projectOptions, setProjectOptions] = useState<string[] | null>(null);
  const [project, setProject] = useState("");
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Load the project names from the board (best-effort).
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/board", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as BoardData;
        if (alive) setProjectOptions(data.groups.map((g) => g.project));
      } catch {
        if (alive) setProjectOptions([]); // signed out / error → free text
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: Math.max(MARGIN, Math.min(x, window.innerWidth - width - MARGIN)),
      top: Math.max(MARGIN, Math.min(y, window.innerHeight - height - MARGIN)),
    });
  }, [x, y, projectOptions]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canAdd = useMemo(
    () => project.trim().length > 0 && !!start && !!end,
    [project, start, end],
  );

  const submit = () => {
    if (!canAdd) return;
    onAdd({ project: project.trim(), startDate: start, endDate: end });
  };

  const hasOptions = projectOptions !== null && projectOptions.length > 0;

  return (
    <>
      <div className="cp-backdrop" onClick={onClose} aria-hidden />
      <div
        ref={cardRef}
        className="create-pop period-pop"
        role="dialog"
        aria-label="프로젝트 기간 추가"
        style={{ left: pos.left, top: pos.top }}
      >
        <div className="cp-head">
          <span className="cp-title">프로젝트 기간 추가</span>
          <button type="button" className="cp-x" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <label className="cp-field">
          <span className="cp-label">프로젝트</span>
          {hasOptions ? (
            <select
              className="cp-select"
              value={project}
              onChange={(e) => setProject(e.target.value)}
            >
              <option value="" disabled>
                선택…
              </option>
              {projectOptions!.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="cp-input"
              type="text"
              placeholder="프로젝트 이름 (노션 Project와 동일하게)"
              value={project}
              onChange={(e) => setProject(e.target.value)}
            />
          )}
        </label>

        <div className="cp-row">
          <label className="cp-field">
            <span className="cp-label">시작</span>
            <input
              className="cp-input"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="cp-field">
            <span className="cp-label">종료</span>
            <input
              className="cp-input"
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>

        <button type="button" className="cp-save" onClick={submit} disabled={!canAdd}>
          추가
        </button>
      </div>
    </>
  );
}
