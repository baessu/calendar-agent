"use client";

/**
 * Right "할일" panel (US-008).
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
import { useMemo } from "react";
import { parseDate } from "@/lib/calendar/dates";
import { formatRangeLabel } from "@/lib/calendar/selection";
import { barColors } from "@/lib/color/compose";
import type { Project, Task, TaskType } from "@/lib/types";

interface TaskListPanelProps {
  tasks: Task[];
  projectsById: Map<string, Project>;
  taskTypesById: Map<string, TaskType>;
  /** Highlight a task's bar in the calendar. */
  onSelectTask: (id: string) => void;
  /** The task currently highlighted (its row gets an active style). */
  selectedTaskId: string | null;
  /** Open the creation popover for a new task (footer "＋ 할일 추가"). */
  onAdd: () => void;
  /** Open the marker form for a new marker (legend "＋ 마커"). */
  onAddMarker: () => void;
}

export function TaskListPanel({
  tasks,
  projectsById,
  taskTypesById,
  onSelectTask,
  selectedTaskId,
  onAdd,
  onAddMarker,
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

  return (
    <aside className="ed-list" aria-label="할일 목록">
      <div className="ed-list-head">
        할일 <span className="numbadge">{tasks.length}</span>
        <span className="ed-list-sort">날짜순</span>
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

      {sorted.length === 0 ? (
        <p className="tp-empty">일칸을 드래그해 첫 할일을 추가하세요.</p>
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
                >
                  <span className="tp-dot" style={{ background: swatch }} aria-hidden />
                  <span className="tp-body">
                    <span className="tp-title">{task.title}</span>
                    <span className="tp-meta">{meta}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button type="button" className="ed-contact" onClick={onAdd}>
        ↳ ＋ 할일 추가
      </button>
    </aside>
  );
}
