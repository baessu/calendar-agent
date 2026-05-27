"use client";

/**
 * Right "일정" panel (US-008).
 *
 * Lists every task in start-date ascending order. Each row shows the title, the
 * date range, and a swatch in the task's bar color (project hue + task-type
 * tone) plus the project / task-type labels — the two classification axes. The
 * swatch matches the calendar bar, tying the list to the grid.
 *
 * Clicking a row highlights its bar in the calendar (scroll + ring) via
 * `onSelectTask`. Empty state nudges the drag-to-create flow. The panel reads
 * the same shared task state as the calendar, so it updates the instant a task
 * is added. Monochrome chrome; the only color is the per-task data swatch.
 */
import { useMemo, useState, type MouseEvent } from "react";
import { parseDate } from "@/lib/calendar/dates";
import { hasNote } from "@/lib/calendar/notes";
import { formatRangeLabel } from "@/lib/calendar/selection";
import { applyTone, barColors } from "@/lib/color/compose";
import { DEFAULT_PROJECT_COLOR } from "@/lib/color/tokens";
import type { Marker, Project, Task, TaskType } from "@/lib/types";

/** Pencil icon for the manage (edit) affordance on legend chips. */
function EditIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  );
}

/** Note glyph (lines of text) marking a task that carries a note (US-019). */
function NoteIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h10" />
    </svg>
  );
}

/** Disclosure chevron — points right when closed, down when open. */
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.12s" }}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

interface TaskListPanelProps {
  tasks: Task[];
  /** Visible markers (event/deadline) — listed chronologically, apart from tasks. */
  markers: Marker[];
  /** All projects, ordered — drives the project legend (US-011). */
  projects: Project[];
  projectsById: Map<string, Project>;
  taskTypesById: Map<string, TaskType>;
  /** Active project tab (null = 전체/통합); sets the category swatch hue. */
  selectedProjectId: string | null;
  /** The active project's own task types (US-020); null = 전체 view → prompt. */
  projectTaskTypes: TaskType[] | null;
  /** Highlight a task's bar in the calendar. */
  onSelectTask: (id: string) => void;
  /** The task currently highlighted (its row gets an active style). */
  selectedTaskId: string | null;
  /** Scroll the calendar to a marker's date + ring its chip (marker row click). */
  onSelectMarker: (id: string) => void;
  /** The marker currently highlighted (its row gets an active style). */
  selectedMarkerId: string | null;
  /** Open the creation popover for a new task (footer "＋ 일정 추가"). */
  onAdd: () => void;
  /** Open the marker form for a new marker (legend "＋ 마커"). */
  onAddMarker: () => void;
  /** Open the project popover to create a new project (legend "＋ 프로젝트"). */
  onAddProject: (x: number, y: number) => void;
  /** Open the project popover to edit/delete a project (legend chip click). */
  onEditProject: (project: Project, x: number, y: number) => void;
  /** Toggle a project's visibility (legend chip) — US-014. */
  onToggleProjectVisible: (id: string) => void;
  /** Open the task-type popover to create a new type (legend "＋ 종류"). */
  onAddTaskType: (x: number, y: number) => void;
  /** Open the task-type popover to edit/delete a type (legend chip click). */
  onEditTaskType: (taskType: TaskType, x: number, y: number) => void;
  /** Task-type ids toggled off in the legend filter (US-015). */
  hiddenTaskTypeIds: Set<string>;
  /** Toggle a task type's on/off filter (legend chip) — US-015. */
  onToggleTaskType: (id: string) => void;
}

export function TaskListPanel({
  tasks,
  markers,
  projects,
  projectsById,
  taskTypesById,
  selectedProjectId,
  projectTaskTypes,
  onSelectTask,
  selectedTaskId,
  onSelectMarker,
  selectedMarkerId,
  onAdd,
  onAddMarker,
  onAddProject,
  onEditProject,
  onToggleProjectVisible,
  onAddTaskType,
  onEditTaskType,
  hiddenTaskTypeIds,
  onToggleTaskType,
}: TaskListPanelProps) {
  // Start-date ascending; ties broken by title for a stable order.
  const sorted = useMemo(
    () =>
      [...tasks].sort(
        (a, b) =>
          parseDate(a.startDate) - parseDate(b.startDate) ||
          a.title.localeCompare(b.title),
      ),
    [tasks],
  );

  // Markers, chronological by date (ISO strings sort correctly), then label.
  const sortedMarkers = useMemo(
    () =>
      [...markers].sort(
        (a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label),
      ),
    [markers],
  );

  // Category (task-type) swatches preview their tone on the active project's
  // color; 전체(통합) view falls back to the default reference. So recoloring a
  // project also recolors its category swatches.
  const refColor =
    (selectedProjectId && projectsById.get(selectedProjectId)?.color) ||
    DEFAULT_PROJECT_COLOR;

  // Q2: the legend cluster is a collapsible "필터·범례" so the 일정 목록 stays
  // the panel's main content (progressive disclosure). Collapsed by default.
  const [showFilters, setShowFilters] = useState(false);

  // Flag active filters on the collapsed bar so hidden state stays visible (P9).
  const hasActiveFilter =
    projects.some((p) => !p.visible) || hiddenTaskTypeIds.size > 0;

  // Immediate hover tooltip for truncated rows. The native `title` attribute is
  // slow and the panel's overflow:auto clips a CSS tooltip, so we render a
  // position:fixed bubble (escapes the overflow) anchored to the hovered row.
  const [tip, setTip] = useState<{ text: string; right: number; top: number } | null>(null);
  const showTip = (e: MouseEvent<HTMLElement>, text: string) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ text, right: window.innerWidth - r.right, top: r.bottom + 4 });
  };
  const hideTip = () => setTip(null);

  return (
    <aside className="ed-list" aria-label="일정·마커 목록">
      {/* 필터·범례 (collapsible, top): 프로젝트/종류 범례 + ＋마커. */}
      <div className="ed-filters">
        <button
          type="button"
          className="ed-filters-toggle"
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
        >
          <ChevronIcon open={showFilters} />
          필터 · 범례
          {hasActiveFilter && (
            <span className="ed-filters-dot" title="필터 적용 중" aria-hidden />
          )}
        </button>
        {showFilters && (
          <div className="ed-filters-body">
      {/* Project legend (US-011/US-014): swatch + name chip. Clicking toggles
          visibility (faded when hidden, no checkbox); pencil manages. */}
      <div className="ed-proj">
        <div className="ed-proj-head">
          프로젝트
          <button
            type="button"
            className="mk-add"
            onClick={(e) => onAddProject(e.clientX, e.clientY)}
          >
            ＋ 프로젝트
          </button>
        </div>
        <div className="ed-proj-list">
          {projects.map((p) => (
            <span key={p.id} className={`proj-row${p.visible ? "" : " off"}`}>
              <button
                type="button"
                className="proj-name"
                onClick={() => onToggleProjectVisible(p.id)}
                aria-pressed={p.visible}
                aria-label={`${p.name} 표시/숨김`}
                title={p.visible ? "클릭하여 숨기기" : "클릭하여 표시"}
              >
                <span className="proj-sw" style={{ background: p.color }} aria-hidden />
                {p.name}
              </button>
              <button
                type="button"
                className="proj-edit"
                onClick={(e) => onEditProject(p, e.clientX, e.clientY)}
                aria-label={`${p.name} 프로젝트 관리`}
                title="관리"
              >
                <EditIcon />
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Task-type legend (US-012/US-015, per-project in US-020): tone swatch
          (previewed on the active project's hue) + name chip. Clicking the chip
          toggles that type's on/off filter; hidden chips render faded (.off). A
          pencil icon opens the manage popover. "＋ 종류" creates one for the
          active project. Task types are per-project, so 전체(통합) view — which
          has no single project — shows a prompt instead. */}
      <div className="ed-type">
        <div className="ed-proj-head">
          태스크 종류
          {projectTaskTypes && (
            <button
              type="button"
              className="mk-add"
              onClick={(e) => onAddTaskType(e.clientX, e.clientY)}
            >
              ＋ 종류
            </button>
          )}
        </div>
        {projectTaskTypes ? (
          <div className="ed-proj-list">
            {projectTaskTypes.map((tt) => {
              const shown = !hiddenTaskTypeIds.has(tt.id);
              return (
                <span key={tt.id} className={`proj-row${shown ? "" : " off"}`}>
                  <button
                    type="button"
                    className="proj-name"
                    onClick={() => onToggleTaskType(tt.id)}
                    aria-pressed={shown}
                    aria-label={`${tt.name} 표시/숨김`}
                    title={shown ? "클릭하여 숨기기" : "클릭하여 표시"}
                  >
                    <span
                      className="proj-sw"
                      style={{ background: applyTone(refColor, tt) }}
                      aria-hidden
                    />
                    {tt.name}
                  </button>
                  <button
                    type="button"
                    className="proj-edit"
                    onClick={(e) => onEditTaskType(tt, e.clientX, e.clientY)}
                    aria-label={`${tt.name} 태스크 종류 관리`}
                    title="관리"
                  >
                    <EditIcon />
                  </button>
                </span>
              );
            })}
          </div>
        ) : (
          <p className="ed-type-hint">
            프로젝트를 선택하면 종류를 관리할 수 있어요.
          </p>
        )}
      </div>

      {/* Marker legend (US-017): monochrome chips, distinct from colored bars.
          The "＋ 마커" button opens the marker form for today. */}
      <div className="ed-legend-row">
        <span className="mk mk-dl">⚑ 데드라인</span>
        <span className="mk mk-ev">◆ 이벤트</span>
        <button type="button" className="mk-add" onClick={onAddMarker}>
          ＋ 마커
        </button>
      </div>
          </div>
        )}
      </div>

      {/* 마커 목록 (날짜순) — 패널 상단. 행 클릭 시 캘린더의 해당 날짜로 이동
          + 칩 하이라이트(일정 목록과 동일). */}
      {sortedMarkers.length > 0 && (
        <>
          <div className="ed-list-head">
            마커 <span className="numbadge">{markers.length}</span>
            <span className="ed-list-sort">날짜순</span>
          </div>
          <ul className="tp-list">
            {sortedMarkers.map((mk) => {
              const project = projectsById.get(mk.projectId);
              const meta = [formatRangeLabel(mk.date, mk.date), project?.name]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={mk.id}>
                  <button
                    type="button"
                    className={`tp-item${mk.id === selectedMarkerId ? " on" : ""}`}
                    onClick={() => onSelectMarker(mk.id)}
                    onMouseEnter={(e) => showTip(e, `${mk.label} · ${meta}`)}
                    onMouseLeave={hideTip}
                  >
                    <span
                      className={`mk ${mk.kind === "deadline" ? "mk-dl" : "mk-ev"} tp-mkchip`}
                      aria-hidden
                    >
                      {mk.kind === "deadline" ? "⚑" : "◆"}
                    </span>
                    <span className="tp-body">
                      <span className="tp-title">{mk.label}</span>
                      <span className="tp-meta">{meta}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* 일정 목록 (날짜순). 마커가 위에 있으면 구분선(subhead). */}
      <div
        className={`ed-list-head${sortedMarkers.length > 0 ? " ed-list-subhead" : ""}`}
      >
        일정 <span className="numbadge">{tasks.length}</span>
        <span className="ed-list-sort">날짜순</span>
      </div>
      {sorted.length === 0 ? (
        <p className="tp-empty">일칸을 드래그해 첫 일정을 추가하세요.</p>
      ) : (
        <ul className="tp-list">
          {sorted.map((task) => {
            const project = projectsById.get(task.projectId);
            const taskType = taskTypesById.get(task.taskTypeId);
            // Swatch = the bar color (project hue + task-type tone).
            const swatch =
              project && taskType
                ? barColors(project.color, taskType).background
                : "var(--text)";
            const meta = [
              formatRangeLabel(task.startDate, task.endDate),
              project?.name,
              taskType?.name,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={task.id}>
                <button
                  type="button"
                  className={`tp-item${task.id === selectedTaskId ? " on" : ""}`}
                  onClick={() => onSelectTask(task.id)}
                  onMouseEnter={(e) => showTip(e, `${task.title} · ${meta}`)}
                  onMouseLeave={hideTip}
                >
                  <span className="tp-dot" style={{ background: swatch }} aria-hidden />
                  <span className="tp-body">
                    <span className="tp-title">{task.title}</span>
                    <span className="tp-meta">{meta}</span>
                  </span>
                  {/* Note indicator (US-019): monochrome glyph when noted. */}
                  {hasNote(task) && (
                    <span className="tp-note" title="메모 있음" aria-label="메모 있음">
                      <NoteIcon />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button type="button" className="ed-contact" onClick={onAdd}>
        ↳ ＋ 일정 추가
      </button>

      {/* Immediate hover tooltip (full title · meta). position:fixed escapes the
          panel's overflow; pointer-events:none so it never steals the hover. */}
      {tip && (
        <div className="tp-tip" role="tooltip" style={{ right: tip.right, top: tip.top }}>
          {tip.text}
        </div>
      )}
    </aside>
  );
}
