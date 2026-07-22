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
import { readSnapshot, writeSnapshot } from "@/lib/board/store";
import { BoardCanvas } from "./BoardCanvas";

export function BoardApp() {
  // Stale-while-revalidate: `data` is what's on screen (a cached snapshot at
  // first, then the fresh Notion result); `refreshing` is a background fetch in
  // flight; `error` is the last fetch failure. The board shows cached data even
  // while refreshing or after an error, so opening it never blanks to a spinner
  // when we already have something to show.
  const [data, setData] = useState<BoardData | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Local disposition overrides applied optimistically, keyed by task id.
  const [overrides, setOverrides] = useState<Record<string, Disposition>>({});
  const [menu, setMenu] = useState<{ task: BoardTask; x: number; y: number } | null>(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);
  const inFlight = useRef(false);

  // Fetch fresh data from Notion and adopt it. Errors are kept in `error` but
  // don't discard whatever is already shown.
  const fetchBoard = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      const res = await fetch("/api/board", { cache: "no-store" });
      if (!res.ok) {
        const d = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(d?.error ?? `board_error_${res.status}`);
      }
      const fresh = (await res.json()) as BoardData;
      setData(fresh);
      writeSnapshot(fresh); // seed the next open's instant paint
      setOverrides({});
      setError(null);
    } catch (err) {
      setError(describeLoad(err));
    } finally {
      setRefreshing(false);
      inFlight.current = false;
    }
  }, []);

  const refresh = useCallback(() => {
    void fetchBoard();
  }, [fetchBoard]);

  // On mount: paint the last cached snapshot immediately (if any), then fetch
  // fresh in the background. Cache read is deferred a microtask so it isn't a
  // synchronous setState in the effect body — still well before the network
  // returns, so the board paints from cache essentially instantly.
  useEffect(() => {
    let alive = true;
    void (async () => {
      await Promise.resolve();
      if (!alive) return;
      const cached = readSnapshot();
      if (cached) setData(cached);
      await fetchBoard();
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
        {data && (
          <span className="bd-meta">
            활성 {data.total}건 · {clock(data.fetchedAt)} 기준
            {refreshing && <span className="bd-syncing"> · 동기화 중…</span>}
            {error && !refreshing && (
              <span className="bd-stale"> · 갱신 실패, 이전 데이터</span>
            )}
          </span>
        )}
        <button
          type="button"
          className="ed-today bd-refresh"
          onClick={refresh}
          disabled={refreshing}
        >
          {refreshing ? "불러오는 중…" : "새로고침"}
        </button>
      </header>

      {/* No cached data yet: show a spinner or the first-load error full-screen.
          Once we have data, it stays on screen through refreshes and errors. */}
      {!data && refreshing && <p className="bd-hint">노션에서 불러오는 중…</p>}
      {!data && !refreshing && error && (
        <div className="bd-hint bd-err" role="alert">
          {error}
        </div>
      )}
      {data &&
        (data.total === 0 ? (
          <p className="bd-hint">활성 태스크가 없어요.</p>
        ) : (
          <BoardCanvas groups={data.groups} dispOf={dispOf} onOpenMenu={setMenu} />
        ))}

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
