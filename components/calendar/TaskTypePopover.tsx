"use client";

/**
 * Task-type create / edit / delete popover (US-012).
 *
 * Opened from the right panel's task-type legend. Task types are global (shared
 * by all projects) and carry a tone step (mode + k) applied over a project color
 * to shade its bars. Create mode (taskType=null) recommends the first unused tone
 * step; edit mode prefills name + tone. The tone picker offers only the 8
 * confirmed ladder steps (color-system.md §3) previewed on a reference hue — we
 * never invent tones.
 *
 * Renaming or retoning a type re-shades its bars immediately (the calendar and
 * panel re-derive bar colors from the task type). Deleting takes a two-step inline
 * confirmation; the type's tasks move to the default type (AC4). The default type
 * hides delete entirely (AC5). When adding past the recommended count a note warns
 * that tones get hard to tell apart (AC6). Swiss editorial: hairlines, no shadow,
 * ESC / ✕ / backdrop close. Shares the .cp-* styling with the other popovers.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { applyTone } from "@/lib/color/compose";
import { DEFAULT_PROJECT_COLOR } from "@/lib/color/tokens";
import {
  TONE_STEPS,
  type ToneStep,
  exceedsRecommendedTaskTypes,
  isDefaultTaskType,
  unusedToneStep,
} from "@/lib/taskType/manage";
import type { TaskType } from "@/lib/types";

/** The edited fields handed back to the parent (name trimmed). */
export interface TaskTypeDraft {
  name: string;
  mode: ToneStep["mode"];
  k: number;
}

interface TaskTypePopoverProps {
  /** null = create a new task type; set = edit that one. */
  taskType: TaskType | null;
  /** Anchor (viewport) coordinates. */
  x: number;
  y: number;
  /** All task types, for the recommended tone + default-type check + count. */
  taskTypes: TaskType[];
  /** Number of tasks using the type being edited (delete copy). */
  taskCount: number;
  onClose: () => void;
  onSave: (draft: TaskTypeDraft) => void;
  /** Delete the type, reassigning its tasks to the default (edit, non-default). */
  onDelete?: () => void;
}

const MARGIN = 12;

/** Reference hue for previewing tone steps (블루); tones are global, not per-hue. */
const PREVIEW_HUE = DEFAULT_PROJECT_COLOR;

export function TaskTypePopover({
  taskType,
  x,
  y,
  taskTypes,
  taskCount,
  onClose,
  onSave,
  onDelete,
}: TaskTypePopoverProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  const isDefault = taskType
    ? isDefaultTaskType(taskType.id, taskTypes)
    : false;

  const [name, setName] = useState(taskType?.name ?? "");
  const [tone, setTone] = useState<ToneStep>(
    taskType
      ? { mode: taskType.mode, k: taskType.k }
      : unusedToneStep(taskTypes),
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Creating one more than the recommended count makes tones hard to tell apart.
  const showRecommendNote =
    !taskType && exceedsRecommendedTaskTypes(taskTypes.length);

  // Clamp the card inside the viewport once its real size is known.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = Math.max(MARGIN, Math.min(x, window.innerWidth - width - MARGIN));
    const top = Math.max(MARGIN, Math.min(y, window.innerHeight - height - MARGIN));
    setPos({ left, top });
  }, [x, y]);

  // Focus the name field on open.
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
    const trimmed = name.trim();
    if (!trimmed) {
      setError("이름을 입력하세요");
      inputRef.current?.focus();
      return;
    }
    onSave({ name: trimmed, mode: tone.mode, k: tone.k });
  }

  const canDelete = Boolean(taskType) && !isDefault && onDelete;

  return (
    <div className="cp-backdrop" onPointerDown={onClose}>
      <div
        ref={cardRef}
        className="create-pop"
        style={{ left: pos.left, top: pos.top }}
        role="dialog"
        aria-label={taskType ? "태스크 종류 편집" : "새 태스크 종류"}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="cp-head">
          <span className="cp-title">
            {taskType ? "태스크 종류 편집" : "새 태스크 종류"}
          </span>
          <button type="button" className="cp-x" aria-label="닫기" onClick={onClose}>
            ✕
          </button>
        </div>

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
            value={name}
            placeholder="종류 이름"
            aria-label="태스크 종류 이름"
            aria-invalid={error ? true : undefined}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
          />
          {error && <p className="cp-err">{error}</p>}

          {/* Tone step picker: the 8 confirmed ladder steps previewed on a
              reference hue (진함 → 연함). The chosen step is ringed. */}
          <div className="cp-field">
            <span className="cp-label">톤</span>
            <div className="pp-palette" role="radiogroup" aria-label="톤 단계">
              {TONE_STEPS.map((s, i) => {
                const selected = s.mode === tone.mode && s.k === tone.k;
                return (
                  <button
                    key={`${s.mode}-${s.k}`}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={`톤 ${i + 1}`}
                    title={`톤 ${i + 1}${i === 0 ? " (가장 진함)" : i === TONE_STEPS.length - 1 ? " (가장 연함)" : ""}`}
                    className={`tt-sw${selected ? " on" : ""}`}
                    style={{ background: applyTone(PREVIEW_HUE, s) }}
                    onClick={() => setTone(s)}
                  />
                );
              })}
            </div>
            <span className="tt-ends" aria-hidden>
              <span>진함</span>
              <span>연함</span>
            </span>
          </div>

          {showRecommendNote && (
            <p className="pp-note" role="note">
              권장 단계는 8개예요. 더 추가하면 톤 구분이 어려워질 수 있어요.
            </p>
          )}

          <div className="cp-foot">
            {canDelete ? (
              confirmingDelete ? (
                <span className="cp-confirm" role="alert">
                  {taskCount > 0 ? (
                    <>
                      <span className="cp-confirm-q">
                        일정 {taskCount}개 기본 종류로 이동
                      </span>
                      <button
                        type="button"
                        className="cp-confirm-yes"
                        onClick={() => onDelete?.()}
                      >
                        이동 후 삭제
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="cp-confirm-q">삭제할까요?</span>
                      <button
                        type="button"
                        className="cp-confirm-yes"
                        onClick={() => onDelete?.()}
                      >
                        삭제
                      </button>
                    </>
                  )}
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
              )
            ) : taskType && isDefault ? (
              <span className="pp-note">기본 태스크종류는 삭제할 수 없습니다</span>
            ) : (
              <span />
            )}
            <button type="submit" className="cp-save">
              {taskType ? "저장" : "추가"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
