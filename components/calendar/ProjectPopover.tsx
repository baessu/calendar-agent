"use client";

/**
 * Project create / edit / delete popover (US-011).
 *
 * Opened from the right panel's project legend. Create mode (project=null)
 * prefills the recommended unused hue (AC: "미사용 색을 기본 추천값으로 제시");
 * edit mode prefills the project's name + color. The 8-color palette is the
 * confirmed PROJECT_COLORS identity set (color-system.md §2) — project identity
 * colors are allowed in legends/pickers, distinct from the "color only on bars"
 * rule for the grid chrome.
 *
 * Renaming/recoloring a project re-tones its bars immediately (the calendar and
 * panel re-derive bar colors from project.color). Deleting takes a two-step
 * inline confirmation that asks how to handle the project's tasks — delete them
 * or move them to the default project (AC4). The default project hides delete
 * entirely (AC5). Swiss editorial: hairlines, no shadow, ESC / ✕ / backdrop close.
 */
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { PROJECT_COLORS } from "@/lib/color/tokens";
import { isDefaultProject, unusedProjectColor } from "@/lib/project/manage";
import type { Project } from "@/lib/types";

/** How a deleted project's tasks are handled. */
export type DeleteProjectMode = "reassign" | "deleteTasks";

/** The edited fields handed back to the parent (name trimmed). */
export interface ProjectDraft {
  name: string;
  color: string;
}

interface ProjectPopoverProps {
  /** null = create a new project; set = edit that project. */
  project: Project | null;
  /** Anchor (viewport) coordinates. */
  x: number;
  y: number;
  /** All projects, for the recommended unused color + default-project check. */
  projects: Project[];
  /** Number of tasks owned by the project being edited (delete copy). */
  taskCount: number;
  onClose: () => void;
  onSave: (draft: ProjectDraft) => void;
  /** Delete the project, handling its tasks per `mode` (edit, non-default only). */
  onDelete?: (mode: DeleteProjectMode) => void;
}

const MARGIN = 12;

export function ProjectPopover({
  project,
  x,
  y,
  projects,
  taskCount,
  onClose,
  onSave,
  onDelete,
}: ProjectPopoverProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  const isDefault = useMemo(
    () => (project ? isDefaultProject(project.id, projects) : false),
    [project, projects],
  );

  const [name, setName] = useState(project?.name ?? "");
  const [color, setColor] = useState(
    project?.color ?? unusedProjectColor(projects),
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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
    onSave({ name: trimmed, color });
  }

  const canDelete = Boolean(project) && !isDefault && onDelete;

  return (
    <div className="cp-backdrop" onPointerDown={onClose}>
      <div
        ref={cardRef}
        className="create-pop"
        style={{ left: pos.left, top: pos.top }}
        role="dialog"
        aria-label={project ? "프로젝트 편집" : "새 프로젝트"}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="cp-head">
          <span className="cp-title">{project ? "프로젝트 편집" : "새 프로젝트"}</span>
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
            placeholder="프로젝트 이름"
            aria-label="프로젝트 이름"
            aria-invalid={error ? true : undefined}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
          />
          {error && <p className="cp-err">{error}</p>}

          {/* 8-color identity palette (PROJECT_COLORS). The chosen hue is ringed. */}
          <div className="cp-field">
            <span className="cp-label">색</span>
            <div className="pp-palette" role="radiogroup" aria-label="프로젝트 색">
              {PROJECT_COLORS.map((c) => {
                const selected = c.color.toUpperCase() === color.toUpperCase();
                return (
                  <button
                    key={c.color}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={c.name}
                    title={c.name}
                    className={`pp-sw${selected ? " on" : ""}`}
                    style={{ background: c.color }}
                    onClick={() => setColor(c.color)}
                  />
                );
              })}
            </div>
          </div>

          <div className="cp-foot">
            {canDelete ? (
              confirmingDelete ? (
                <span className="cp-confirm" role="alert">
                  {taskCount > 0 ? (
                    <>
                      <span className="cp-confirm-q">일정 {taskCount}개</span>
                      <button
                        type="button"
                        className="cp-confirm-yes"
                        onClick={() => onDelete?.("deleteTasks")}
                      >
                        함께 삭제
                      </button>
                      <button
                        type="button"
                        className="cp-confirm-no"
                        onClick={() => onDelete?.("reassign")}
                      >
                        기본으로 이동
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="cp-confirm-q">삭제할까요?</span>
                      <button
                        type="button"
                        className="cp-confirm-yes"
                        onClick={() => onDelete?.("deleteTasks")}
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
            ) : project && isDefault ? (
              <span className="pp-note">기본 프로젝트는 삭제할 수 없습니다</span>
            ) : (
              <span />
            )}
            <button type="submit" className="cp-save">
              {project ? "저장" : "추가"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
