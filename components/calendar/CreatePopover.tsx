"use client";

/**
 * Creation popover (US-005).
 *
 * Opens when a drag-selection (or single-cell click) is committed, prefilled
 * with the chosen date range. The user types a title and picks a project +
 * task type, then saves — the parent persists the task and the calendar paints
 * a bar across the range. Empty titles are blocked with an inline message.
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
import type { DateString, Project, TaskType } from "@/lib/types";
import { formatRangeLabel } from "@/lib/calendar/selection";

/** Values the form collects; the parent adds the date range + persists. */
export interface CreateTaskDraft {
  title: string;
  projectId: string;
  taskTypeId: string;
}

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
  onCreate: (draft: CreateTaskDraft) => void;
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
  const [pos, setPos] = useState({ left: x, top: y });

  const [title, setTitle] = useState("");
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

  const canSave = useMemo(
    () => projects.length > 0 && taskTypes.length > 0,
    [projects.length, taskTypes.length],
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
    setPos({ left, top });
  }, [x, y]);

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
      setError({ field: "title", msg: "제목을 입력하세요" });
      inputRef.current?.focus();
      return;
    }
    if (!canSave || !taskTypeId) return;
    if (!projectId) {
      setError({ field: "project", msg: "프로젝트를 선택하세요" });
      return;
    }
    onCreate({ title: trimmed, projectId, taskTypeId });
  }

  return (
    <div className="cp-backdrop" onPointerDown={onClose}>
      <div
        ref={cardRef}
        className="create-pop"
        style={{ left: pos.left, top: pos.top }}
        role="dialog"
        aria-label="새 일정"
        // Keep clicks inside the card from reaching the backdrop.
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="cp-head">
          <span className="cp-title">새 일정</span>
          <button type="button" className="cp-x" aria-label="닫기" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="cp-range">{formatRangeLabel(start, end)}</div>

        <form
          className="cp-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            ref={inputRef}
            className="cp-input"
            type="text"
            value={title}
            placeholder="일정 제목"
            aria-label="일정 제목"
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
          </div>
          {error?.field === "project" && <p className="cp-err">{error.msg}</p>}

          <button type="submit" className="cp-save" disabled={!canSave}>
            저장
          </button>
        </form>
      </div>
    </div>
  );
}
