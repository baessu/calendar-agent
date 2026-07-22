"use client";

/**
 * Popup listing a project's Notion tasks — opened by clicking a project-period
 * bar on the calendar. The tasks are the period's "children": board tasks whose
 * Notion `Project` equals this period's project name.
 *
 * Fetches the board on open and filters to the one project (the board endpoint
 * returns all groups; reusing it avoids a second endpoint). The board is auth-
 * gated, so when the viewer isn't signed in the popup says so instead of
 * erroring — project periods themselves are local and work without an account,
 * but their Notion children need one.
 */
import { useEffect, useRef, useState } from "react";
import type { BoardData, BoardTask } from "@/lib/board/types";
import type { ProjectPeriod } from "@/lib/periods/types";
import { dispositionLabel, dispositionTier, formatEstimate } from "@/components/board/disposition";

interface PeriodTasksPopupProps {
  project: string;
  x: number;
  y: number;
  /** This project's period(s) — shown as the date range, with delete. */
  periods: ProjectPeriod[];
  onDeletePeriod: (id: string) => void;
  onClose: () => void;
}

type State =
  | { k: "loading" }
  | { k: "signedOut" }
  | { k: "error" }
  | { k: "ready"; tasks: BoardTask[] };

const MARGIN = 12;

export function PeriodTasksPopup({
  project,
  x,
  y,
  periods,
  onDeletePeriod,
  onClose,
}: PeriodTasksPopupProps) {
  const [state, setState] = useState<State>({ k: "loading" });
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/board", { cache: "no-store" });
        if (res.status === 401) {
          if (alive) setState({ k: "signedOut" });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as BoardData;
        const group = data.groups.find((g) => g.project === project);
        if (alive) setState({ k: "ready", tasks: group?.tasks ?? [] });
      } catch {
        if (alive) setState({ k: "error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [project]);

  // Clamp within the viewport once measured.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: Math.max(MARGIN, Math.min(x, window.innerWidth - width - MARGIN)),
      top: Math.max(MARGIN, Math.min(y, window.innerHeight - height - MARGIN)),
    });
  }, [x, y, state]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="pp-backdrop" onClick={onClose} aria-hidden />
      <div
        ref={cardRef}
        className="pp-card"
        role="dialog"
        aria-label={`${project} 태스크`}
        style={{ left: pos.left, top: pos.top }}
      >
        <div className="pp-head">
          <span className="pp-title">{project}</span>
          {state.k === "ready" && <span className="pp-count">{state.tasks.length}건</span>}
          <button type="button" className="pp-close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        {periods.length > 0 && (
          <div className="pp-periods">
            {periods.map((p) => (
              <div key={p.id} className="pp-period">
                <span className="pp-period-range">
                  {p.startDate} ~ {p.endDate}
                </span>
                <button
                  type="button"
                  className="pp-period-del"
                  onClick={() => onDeletePeriod(p.id)}
                >
                  기간 삭제
                </button>
              </div>
            ))}
          </div>
        )}

        {state.k === "loading" && <p className="pp-note">노션에서 불러오는 중…</p>}
        {state.k === "signedOut" && (
          <p className="pp-note">
            로그인하면 이 프로젝트의 태스크가 보여요.{" "}
            <a href="/login?callbackUrl=/" className="pp-link">
              로그인
            </a>
          </p>
        )}
        {state.k === "error" && <p className="pp-note">태스크를 불러오지 못했어요.</p>}
        {state.k === "ready" &&
          (state.tasks.length === 0 ? (
            <p className="pp-note">활성 태스크가 없어요.</p>
          ) : (
            <ul className="pp-list">
              {state.tasks.map((t) => {
                const est = formatEstimate(t.estMinutes);
                return (
                  <li key={t.id} className="pp-task" data-tier={dispositionTier(t.disposition)}>
                    <div className="pp-task-top">
                      <span className="pp-disp">{dispositionLabel(t.disposition)}</span>
                      {t.due && <span className="pp-due">{t.due}</span>}
                    </div>
                    <div className="pp-task-title">{t.title}</div>
                    {est && <div className="pp-task-est">{est}</div>}
                  </li>
                );
              })}
            </ul>
          ))}
      </div>
    </>
  );
}
