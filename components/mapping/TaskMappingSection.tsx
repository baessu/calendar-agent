"use client";

/**
 * "보드 태스크 연결" — inside the calendar 일정's edit popover, attach board
 * (Notion) tasks to this schedule. Manual assignment: shows the currently
 * mapped board tasks (with remove), and a picker to add more from the board.
 *
 * The board is auth-gated, so when the viewer is signed out this explains that
 * instead of erroring — the mapping itself is local and would work, but the
 * board task list needs an account to load. Titles for already-mapped ids are
 * resolved from the same fetch; ids we can't resolve (e.g. a task deleted in
 * Notion) still render with their id so they can be removed.
 */
import { useEffect, useMemo, useState } from "react";
import type { BoardData, BoardTask } from "@/lib/board/types";
import { dispositionLabel } from "@/components/board/disposition";

interface TaskMappingSectionProps {
  /** Board task ids currently attached to this 일정. */
  mappedIds: string[];
  /** Persist a new attachment set (parent stores it + updates bar counts). */
  onChange: (ids: string[]) => void;
}

type Load =
  | { k: "loading" }
  | { k: "signedOut" }
  | { k: "error" }
  | { k: "ready"; tasks: BoardTask[] };

export function TaskMappingSection({ mappedIds, onChange }: TaskMappingSectionProps) {
  const [load, setLoad] = useState<Load>({ k: "loading" });
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/board", { cache: "no-store" });
        if (res.status === 401) {
          if (alive) setLoad({ k: "signedOut" });
          return;
        }
        if (!res.ok) throw new Error();
        const data = (await res.json()) as BoardData;
        if (alive) setLoad({ k: "ready", tasks: data.groups.flatMap((g) => g.tasks) });
      } catch {
        if (alive) setLoad({ k: "error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const byId = useMemo(() => {
    const m = new Map<string, BoardTask>();
    if (load.k === "ready") for (const t of load.tasks) m.set(t.id, t);
    return m;
  }, [load]);

  const mappedSet = useMemo(() => new Set(mappedIds), [mappedIds]);

  // Candidates for the picker: unmapped board tasks matching the search.
  const candidates = useMemo(() => {
    if (load.k !== "ready") return [];
    const q = query.trim().toLowerCase();
    return load.tasks
      .filter((t) => !mappedSet.has(t.id))
      .filter((t) => !q || t.title.toLowerCase().includes(q) || (t.project ?? "").toLowerCase().includes(q))
      .slice(0, 40);
  }, [load, query, mappedSet]);

  const add = (id: string) => onChange([...mappedIds, id]);
  const remove = (id: string) => onChange(mappedIds.filter((x) => x !== id));

  return (
    <div className="cp-field tm-section">
      <span className="cp-label">보드 태스크 연결</span>

      {mappedIds.length === 0 ? (
        <p className="tm-empty">연결된 보드 태스크가 없어요.</p>
      ) : (
        <ul className="tm-list">
          {mappedIds.map((id) => {
            const t = byId.get(id);
            return (
              <li key={id} className="tm-item">
                <span className="tm-item-title">{t ? t.title : "(노션에서 찾을 수 없음)"}</span>
                {t && <span className="tm-item-proj">{t.project ?? "미분류"}</span>}
                <button
                  type="button"
                  className="tm-remove"
                  aria-label="연결 해제"
                  onClick={() => remove(id)}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {load.k === "loading" && <p className="tm-note">보드를 불러오는 중…</p>}
      {load.k === "signedOut" && (
        <p className="tm-note">
          보드 태스크를 연결하려면{" "}
          <a href="/login?callbackUrl=/" className="tm-link">
            로그인
          </a>
          하세요.
        </p>
      )}
      {load.k === "error" && <p className="tm-note">보드를 불러오지 못했어요.</p>}

      {load.k === "ready" && !picking && (
        <button type="button" className="tm-add" onClick={() => setPicking(true)}>
          ＋ 태스크 연결
        </button>
      )}

      {load.k === "ready" && picking && (
        <div className="tm-picker">
          <input
            className="cp-input tm-search"
            type="text"
            placeholder="태스크 검색…"
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className="tm-cands">
            {candidates.length === 0 && <li className="tm-note">결과 없음</li>}
            {candidates.map((t) => (
              <li key={t.id}>
                <button type="button" className="tm-cand" onClick={() => add(t.id)}>
                  <span className="tm-cand-title">{t.title}</span>
                  <span className="tm-cand-meta">
                    {t.project ?? "미분류"} · {dispositionLabel(t.disposition)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="tm-done" onClick={() => setPicking(false)}>
            완료
          </button>
        </div>
      )}
    </div>
  );
}
