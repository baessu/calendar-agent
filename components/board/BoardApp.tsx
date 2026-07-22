"use client";

/**
 * Task board — a live, monochrome view over the Notion TASK DB.
 *
 * Loads /api/board on mount, renders tasks grouped by project. Tapping a card
 * opens a menu to change its disposition, which writes back to Notion
 * optimistically (the card updates instantly; on failure it rolls back and
 * surfaces the error). Mirrors the calendar's editorial shell — hairlines,
 * monochrome, no fill — so board and calendar read as one app.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { BoardData, BoardTask, Disposition } from "@/lib/board/types";
import { DISPOSITIONS } from "@/lib/board/types";
import {
  dispositionLabel,
  dispositionTier,
  formatEstimate,
} from "./disposition";

type Load =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; data: BoardData };

export function BoardApp() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  // Local disposition overrides applied optimistically, keyed by task id.
  const [overrides, setOverrides] = useState<Record<string, Disposition>>({});
  const [menu, setMenu] = useState<{ task: BoardTask; x: number; y: number } | null>(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);

  // The fetch itself — only sets state AFTER awaiting, so it is safe to call
  // straight from the mount effect (initial state is already "loading").
  const fetchBoard = useCallback(async () => {
    try {
      const res = await fetch("/api/board", { cache: "no-store" });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(d?.error ?? `board_error_${res.status}`);
      }
      const data = (await res.json()) as BoardData;
      setLoad({ state: "ready", data });
      setOverrides({});
    } catch (err) {
      setLoad({ state: "error", message: describeLoad(err) });
    }
  }, []);

  // Manual refresh (button) — shows the loading state, then re-fetches. Not run
  // from an effect, so the synchronous setState here is fine.
  const refresh = useCallback(() => {
    setLoad({ state: "loading" });
    void fetchBoard();
  }, [fetchBoard]);

  // Load on mount. The async IIFE + alive-guard mirrors CalendarApp: setState
  // runs only after the await, and is skipped if the component unmounted first.
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (alive) await fetchBoard();
    })();
    return () => {
      alive = false;
    };
  }, [fetchBoard]);

  // Apply an optimistic disposition change, then persist. Roll back on failure.
  const change = useCallback(
    async (task: BoardTask, next: Disposition) => {
      setMenu(null);
      const prev = overrides[task.id] ?? task.disposition;
      if (prev === next) return;
      setOverrides((o) => ({ ...o, [task.id]: next }));
      try {
        const res = await fetch("/api/board/disposition", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageId: task.id, disposition: next }),
        });
        if (!res.ok) throw new Error(String(res.status));
      } catch {
        // Roll back to the value before this change.
        setOverrides((o) => ({ ...o, [task.id]: prev }));
        setToast("노션 저장 실패 — 되돌렸어요");
      }
    },
    [overrides],
  );

  // Auto-dismiss the toast.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const dispOf = useCallback(
    (t: BoardTask): Disposition =>
      t.id in overrides ? overrides[t.id] : t.disposition,
    [overrides],
  );

  return (
    <main className="bd-shell">
      <header className="bd-bar">
        <Link href="/" className="ed-today">
          ← 캘린더
        </Link>
        <h1 className="bd-ttl">태스크 보드</h1>
        {load.state === "ready" && (
          <span className="bd-meta">
            활성 {load.data.total}건 · {clock(load.data.fetchedAt)} 기준
          </span>
        )}
        <button
          type="button"
          className="ed-today bd-refresh"
          onClick={refresh}
          disabled={load.state === "loading"}
        >
          {load.state === "loading" ? "불러오는 중…" : "새로고침"}
        </button>
      </header>

      {load.state === "loading" && <p className="bd-hint">노션에서 불러오는 중…</p>}
      {load.state === "error" && (
        <div className="bd-hint bd-err" role="alert">
          {load.message}
        </div>
      )}
      {load.state === "ready" && (
        <BoardGrid data={load.data} dispOf={dispOf} onOpenMenu={setMenu} />
      )}

      {menu && (
        <DispositionMenu
          task={menu.task}
          current={dispOf(menu.task)}
          x={menu.x}
          y={menu.y}
          onPick={(d) => void change(menu.task, d)}
          onClose={() => setMenu(null)}
        />
      )}
      {toast && <div className="bd-toast" role="status">{toast}</div>}
    </main>
  );
}

/** The grouped columns. Split out so the menu overlay doesn't re-render it. */
function BoardGrid({
  data,
  dispOf,
  onOpenMenu,
}: {
  data: BoardData;
  dispOf: (t: BoardTask) => Disposition;
  onOpenMenu: (m: { task: BoardTask; x: number; y: number }) => void;
}) {
  if (data.total === 0) {
    return <p className="bd-hint">활성 태스크가 없어요.</p>;
  }
  return (
    <div className="bd-grid">
      {data.groups.map((g) => (
        <section key={g.project} className="bd-col">
          <div className="bd-col-head">
            <h2 className="bd-col-name">{g.project}</h2>
            <span className="bd-col-count">{g.tasks.length}</span>
          </div>
          <div className="bd-col-list">
            {g.tasks.map((t) => (
              <Card key={t.id} task={t} disposition={dispOf(t)} onOpen={onOpenMenu} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Card({
  task,
  disposition,
  onOpen,
}: {
  task: BoardTask;
  disposition: Disposition;
  onOpen: (m: { task: BoardTask; x: number; y: number }) => void;
}) {
  const est = formatEstimate(task.estMinutes);
  const open = (e: React.MouseEvent | React.KeyboardEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onOpen({ task, x: r.right - 6, y: r.top + 6 });
  };
  return (
    <article
      className="bd-card"
      data-tier={dispositionTier(disposition)}
      tabIndex={0}
      role="button"
      aria-label={`${task.title} — 처분: ${dispositionLabel(disposition)}. 눌러서 변경`}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open(e);
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

function DispositionMenu({
  task,
  current,
  x,
  y,
  onPick,
  onClose,
}: {
  task: BoardTask;
  current: Disposition;
  x: number;
  y: number;
  onPick: (d: Disposition) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
    });
  }, [x, y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="bd-backdrop" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        className="bd-menu"
        role="menu"
        style={{ left: pos.left, top: pos.top }}
      >
        <div className="bd-menu-cap">{task.title}</div>
        {DISPOSITIONS.map((d) => (
          <button
            key={d.value}
            type="button"
            role="menuitem"
            className="bd-menu-item"
            onClick={() => onPick(d.value)}
          >
            <span>{d.label}</span>
            {current === d.value && <span className="bd-menu-cur">현재</span>}
          </button>
        ))}
        <button
          type="button"
          role="menuitem"
          className="bd-menu-item bd-menu-clear"
          onClick={() => onPick(null)}
        >
          <span>태그 지우기</span>
          {current === null && <span className="bd-menu-cur">현재</span>}
        </button>
      </div>
    </>
  );
}

/** "HH:MM" in the viewer's locale. */
function clock(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function describeLoad(err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  if (msg === "unauthorized")
    return "세션이 만료됐어요. 다시 로그인해 주세요.";
  if (msg === "board_not_configured")
    return "노션 연동이 설정되지 않았어요 (NOTION_TOKEN 필요).";
  if (msg === "notion_fetch_failed" || msg.startsWith("board_error_"))
    return "노션에서 불러오지 못했어요. 새로고침해 주세요.";
  return "보드를 불러오지 못했어요.";
}
