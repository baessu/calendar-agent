"use client";

/**
 * Creation popover (US-005 + markers from the create flow).
 *
 * Opens when a drag-selection (or single-cell click) is committed, prefilled
 * with the chosen date range. A type toggle picks what to create:
 *   - 일정 (task): title + project + 종류 → a colored bar across the range.
 *   - 이벤트 / 데드라인 (marker): label + project → a point-date chip on the
 *     selection's start day (markers are single-date; US-017/021).
 * Letting markers be created here means the reused <CalendarView> gives the
 * same affordance to a collaborator on the edit page (who has no side panel).
 *
 * No shadow (Swiss editorial = hairlines only); a transparent backdrop catches
 * outside clicks. Positioned near the pointer-release point, clamped to the
 * viewport. ESC / backdrop click / ✕ cancels.
 */
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { DateString, MarkerKind, Project, TaskType } from "@/lib/types";
import { formatRangeLabel } from "@/lib/calendar/selection";

/** What the create popover hands back — a task or a marker, discriminated. */
export type CreateDraft =
  | {
      kind: "task";
      title: string;
      projectId: string;
      taskTypeId: string;
      /** Free-text note, trimmed; "" = none (US-019). */
      note: string;
    }
  | { kind: "marker"; markerKind: MarkerKind; label: string; projectId: string };

/** Back-compat alias for the task shape some callers still reference. */
export type CreateTaskDraft = Extract<CreateDraft, { kind: "task" }>;

/** The create popover's type tab. */
type Mode = "task" | "event" | "deadline";

interface CreatePopoverProps {
  start: DateString;
  end: DateString;
  /** Pointer-release viewport coordinates used to anchor the card. */
  x: number;
  y: number;
  projects: Project[];
  taskTypes: TaskType[];
  /** Project pre-selected (the current view's project). */
  defaultProjectId: string | null;
  onClose: () => void;
  onCreate: (draft: CreateDraft) => void;
}

const MARGIN = 12;

export function CreatePopover({
  start,
  end,
  x,
  y,
  projects,
  taskTypes,
  defaultProjectId,
  onClose,
  onCreate,
}: CreatePopoverProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight?: number }>(
    { left: x, top: y },
  );

  const [mode, setMode] = useState<Mode>("task");
  const isMarker = mode !== "task";

  const [title, setTitle] = useState("");
  // Optional free-text note for a 일정 (US-019); markers have no note.
  const [note, setNote] = useState("");
  // In the merged "전체" view (no defaultProjectId) the project is left unchosen
  // so the user must pick one (US-013 AC4); an individual view preselects it.
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  // US-020: task types are per-project, so the 종류 options follow the selected
  // project. The initial type is the chosen project's first.
  const [taskTypeId, setTaskTypeId] = useState(
    () => taskTypes.find((t) => t.projectId === (defaultProjectId ?? ""))?.id ?? "",
  );
  const [error, setError] = useState<{
    field: "title" | "project";
    msg: string;
  } | null>(null);

  // Types belonging to the currently selected project.
  const projectTaskTypes = useMemo(
    () => taskTypes.filter((t) => t.projectId === projectId),
    [taskTypes, projectId],
  );

  // A task needs a project + at least one task type; a marker needs only a
  // project (markers have no task type).
  const canSave = useMemo(
    () => projects.length > 0 && (isMarker || taskTypes.length > 0),
    [projects.length, taskTypes.length, isMarker],
  );

  // Switch the project (and reset 종류 to that project's first type).
  function selectProject(pid: string) {
    setProjectId(pid);
    setTaskTypeId(taskTypes.find((t) => t.projectId === pid)?.id ?? "");
    if (error?.field === "project") setError(null);
  }

  // Clamp the card inside the viewport once its real size is known.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = Math.max(MARGIN, Math.min(x, window.innerWidth - width - MARGIN));
    const top = Math.max(MARGIN, Math.min(y, window.innerHeight - height - MARGIN));
    const maxHeight = window.innerHeight - top - MARGIN;
    setPos({ left, top, maxHeight });
  }, [x, y, mode]);

  // Focus the title field on open.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ESC closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) {
      setError({ field: "title", msg: isMarker ? "라벨을 입력하세요" : "제목을 입력하세요" });
      inputRef.current?.focus();
      return;
    }
    if (!canSave) return;
    if (!projectId) {
      setError({ field: "project", msg: "프로젝트를 선택하세요" });
      return;
    }
    if (isMarker) {
      onCreate({ kind: "marker", markerKind: mode, label: trimmed, projectId });
      return;
    }
    if (!taskTypeId) return;
    onCreate({ kind: "task", title: trimmed, projectId, taskTypeId, note: note.trim() });
  }

  function pickMode(next: Mode) {
    setMode(next);
    // Clear a stale 종류/제목 validation when the field set changes.
    if (error?.field === "title") setError(null);
  }

  return (
    <div className="cp-backdrop" onPointerDown={onClose}>
      <div
        ref={cardRef}
        className="create-pop cp-create"
        style={{ left: pos.left, top: pos.top, maxHeight: pos.maxHeight }}
        role="dialog"
        aria-label="새 일정"
        // Keep clicks inside the card from reaching the backdrop.
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="cp-head">
          <span className="cp-title">{isMarker ? "새 마커" : "새 일정"}</span>
          <button type="button" className="cp-x" aria-label="닫기" onClick={onClose}>
            ✕
          </button>
        </div>
        {/* Markers are point-date: show just the start day, not the range. */}
        <div className="cp-range">{formatRangeLabel(start, isMarker ? start : end)}</div>

        <form
          className="cp-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {/* Type toggle: 일정(bar) vs 이벤트/데드라인(marker). */}
          <div className="mk-kinds" role="radiogroup" aria-label="추가할 유형">
            <button
              type="button"
              role="radio"
              aria-checked={mode === "task"}
              className={`mk-kind${mode === "task" ? " on" : ""}`}
              onClick={() => pickMode("task")}
            >
              일정
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === "event"}
              className={`mk-kind${mode === "event" ? " on" : ""}`}
              onClick={() => pickMode("event")}
            >
              ◆ 이벤트
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === "deadline"}
              className={`mk-kind${mode === "deadline" ? " on" : ""}`}
              onClick={() => pickMode("deadline")}
            >
              ⚑ 데드라인
            </button>
          </div>

          <input
            ref={inputRef}
            className="cp-input"
            type="text"
            value={title}
            placeholder={isMarker ? "마커 라벨" : "일정 제목"}
            aria-label={isMarker ? "마커 라벨" : "일정 제목"}
            aria-invalid={error?.field === "title" ? true : undefined}
            onChange={(e) => {
              setTitle(e.target.value);
              if (error?.field === "title") setError(null);
            }}
          />
          {error?.field === "title" && <p className="cp-err">{error.msg}</p>}

          <div className="cp-row">
            <label className="cp-field">
              <span className="cp-label">프로젝트</span>
              <select
                className="cp-select"
                value={projectId}
                aria-invalid={error?.field === "project" ? true : undefined}
                onChange={(e) => selectProject(e.target.value)}
              >
                {/* Merged view: an empty placeholder forces a deliberate pick. */}
                {!defaultProjectId && (
                  <option value="" disabled>
                    프로젝트 선택
                  </option>
                )}
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            {/* 종류 (task type) applies to 일정 only — markers have no type. */}
            {!isMarker && (
              <label className="cp-field">
                <span className="cp-label">종류</span>
                <select
                  className="cp-select"
                  value={taskTypeId}
                  disabled={!projectId}
                  onChange={(e) => setTaskTypeId(e.target.value)}
                >
                  {/* No project chosen yet (전체 view): prompt to pick one first. */}
                  {!projectId && (
                    <option value="" disabled>
                      프로젝트 먼저 선택
                    </option>
                  )}
                  {projectTaskTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {error?.field === "project" && <p className="cp-err">{error.msg}</p>}

          {/* Note applies to 일정 only — markers have no note (US-019). */}
          {!isMarker && (
            <textarea
              className="cp-note"
              value={note}
              placeholder="메모를 입력하세요 (선택)"
              aria-label="메모"
              onChange={(e) => setNote(e.target.value)}
            />
          )}

          <button type="submit" className="cp-save" disabled={!canSave}>
            저장
          </button>
        </form>
      </div>
    </div>
  );
}
