"use client";

/**
 * Edit / delete popover (US-009).
 *
 * Opens when a task bar is clicked, prefilled with the task's current values.
 * The user can change the title, start/end dates, project, and task type, then
 * save — the parent persists the patch and the calendar re-paints the bar (its
 * hue/tone update immediately). Deleting takes a two-step inline confirmation
 * (no native dialog), keeping the Swiss-editorial, shadow-less chrome.
 *
 * Reverse date order is normalized on save (same rule as drag-select). A
 * transparent backdrop catches outside clicks; ESC / ✕ cancels. Positioned near
 * the click point and clamped to the viewport. Shares the .cp-* styling with the
 * creation popover.
 */
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { DateString, Project, Task, TaskType } from "@/lib/types";
import { formatRangeLabel, normalizeRange } from "@/lib/calendar/selection";
import { TaskMappingSection } from "@/components/mapping/TaskMappingSection";

/** The edited fields handed back to the parent (already title-trimmed + range-normalized). */
export interface EditTaskDraft {
  title: string;
  projectId: string;
  taskTypeId: string;
  startDate: DateString;
  endDate: DateString;
  /** Free-text note, trimmed; "" clears it (US-019). */
  note: string;
}

interface EditPopoverProps {
  task: Task;
  /** Click (or focused bar) viewport coordinates used to anchor the card. */
  x: number;
  y: number;
  projects: Project[];
  taskTypes: TaskType[];
  onClose: () => void;
  onSave: (changes: EditTaskDraft) => void;
  onDelete: () => void;
  /** Board task ids attached to this 일정 (app-only mapping). */
  mappedBoardIds?: string[];
  /**
   * Persist a new attachment set for this 일정. When omitted (e.g. the share
   * pages, which have no board/account context) the mapping section is hidden.
   */
  onMappingChange?: (ids: string[]) => void;
}

const MARGIN = 12;

export function EditPopover({
  task,
  x,
  y,
  projects,
  taskTypes,
  onClose,
  onSave,
  onDelete,
  mappedBoardIds = [],
  onMappingChange,
}: EditPopoverProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Prefill from the task's current values.
  const [title, setTitle] = useState(task.title);
  const [projectId, setProjectId] = useState(task.projectId);
  const [taskTypeId, setTaskTypeId] = useState(task.taskTypeId);
  const [startDate, setStartDate] = useState<DateString>(task.startDate);
  const [endDate, setEndDate] = useState<DateString>(task.endDate);
  const [note, setNote] = useState(task.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const canSave = useMemo(
    () => projects.length > 0 && taskTypes.length > 0,
    [projects.length, taskTypes.length],
  );

  // US-020: task types are per-project, so the 종류 options follow the selected
  // project. Changing the project re-points the type to that project's first.
  const projectTaskTypes = useMemo(
    () => taskTypes.filter((t) => t.projectId === projectId),
    [taskTypes, projectId],
  );

  function selectProject(pid: string) {
    setProjectId(pid);
    // The old type belongs to the old project, so re-point to the new one's first.
    setTaskTypeId(taskTypes.find((t) => t.projectId === pid)?.id ?? "");
  }

  // Live range label tracks the (possibly reverse) date inputs.
  const rangeLabel = useMemo(() => {
    const { start, end } = normalizeRange(startDate, endDate);
    return formatRangeLabel(start, end);
  }, [startDate, endDate]);

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
    inputRef.current?.select();
  }, []);

  // ESC closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function save() {
    const trimmed = title.trim();
    if (!trimmed) {
      setError("제목을 입력하세요");
      inputRef.current?.focus();
      return;
    }
    if (!canSave || !projectId || !taskTypeId || !startDate || !endDate) return;
    // Normalize so a start-after-end edit is auto-corrected (like reverse drag).
    const { start, end } = normalizeRange(startDate, endDate);
    onSave({
      title: trimmed,
      projectId,
      taskTypeId,
      startDate: start,
      endDate: end,
      note: note.trim(),
    });
  }

  return (
    <div className="cp-backdrop" onPointerDown={onClose}>
      <div
        ref={cardRef}
        className="create-pop"
        style={{ left: pos.left, top: pos.top }}
        role="dialog"
        aria-label="일정 편집"
        // Keep clicks inside the card from reaching the backdrop.
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="cp-head">
          <span className="cp-title">일정 편집</span>
          <button type="button" className="cp-x" aria-label="닫기" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="cp-range">{rangeLabel}</div>

        <form
          className="cp-form"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input
            ref={inputRef}
            className="cp-input"
            type="text"
            value={title}
            placeholder="일정 제목"
            aria-label="일정 제목"
            aria-invalid={error ? true : undefined}
            onChange={(e) => {
              setTitle(e.target.value);
              if (error) setError(null);
            }}
          />
          {error && <p className="cp-err">{error}</p>}

          <div className="cp-row">
            <label className="cp-field">
              <span className="cp-label">시작</span>
              <input
                className="cp-date"
                type="date"
                value={startDate}
                aria-label="시작일"
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
            <label className="cp-field">
              <span className="cp-label">종료</span>
              <input
                className="cp-date"
                type="date"
                value={endDate}
                aria-label="종료일"
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
          </div>

          <div className="cp-row">
            <label className="cp-field">
              <span className="cp-label">프로젝트</span>
              <select
                className="cp-select"
                value={projectId}
                onChange={(e) => selectProject(e.target.value)}
              >
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
                onChange={(e) => setTaskTypeId(e.target.value)}
              >
                {projectTaskTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="cp-field">
            <span className="cp-label">노트</span>
            <textarea
              className="cp-note"
              value={note}
              placeholder="메모를 입력하세요 (선택)"
              aria-label="노트"
              rows={3}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          {onMappingChange && (
            <TaskMappingSection mappedIds={mappedBoardIds} onChange={onMappingChange} />
          )}

          <div className="cp-foot">
            {confirmingDelete ? (
              <span className="cp-confirm" role="alert">
                <span className="cp-confirm-q">삭제할까요?</span>
                <button type="button" className="cp-confirm-yes" onClick={onDelete}>
                  삭제
                </button>
                <button
                  type="button"
                  className="cp-confirm-no"
                  onClick={() => setConfirmingDelete(false)}
                >
                  취소
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="cp-del"
                onClick={() => setConfirmingDelete(true)}
              >
                삭제
              </button>
            )}
            <button type="submit" className="cp-save" disabled={!canSave}>
              저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
