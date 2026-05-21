"use client";

/**
 * Infinite-scroll monthly calendar (US-003).
 *
 * Renders a continuous run of months (no paging). The visible month range grows
 * lazily as the user scrolls toward either edge; prepended months are added with
 * scroll anchoring so the viewport never jumps. The top title tracks the month
 * currently pinned under the sticky header, and "오늘" returns to today.
 *
 * Dragging across day cells selects an inclusive range (US-004): passed cells
 * highlight live, and releasing opens the creation popover prefilled with the
 * range; a single click selects one day. Saving paints a colored bar (US-005/006)
 * stacked into lanes (US-007). Shared data (projects/task types/tasks) is owned
 * by <CalendarApp>; this view is presentational over those props. A panel row
 * click (US-008) arrives as `highlightNonce`/`highlightedTaskId` to scroll the
 * matching bar into view and ring it. The grid is the line-less Swiss layout
 * from the F-tab mockup.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addMonths,
  buildWeeksRange,
  groupWeeksByMonth,
  monthLabel,
  weekKeysInRange,
  WEEKDAYS,
  type YearMonth,
} from "@/lib/calendar/infinite";
import { todayDateString } from "@/lib/calendar/dates";
import { isWithinRange, normalizeRange, type DateRange } from "@/lib/calendar/selection";
import { weekSegments } from "@/lib/calendar/segments";
import { DEFAULT_MAX_LANES, layoutWeek } from "@/lib/calendar/layout";
import { groupMarkersByDate } from "@/lib/calendar/markers";
import { barColors } from "@/lib/color/compose";
import type { MarkerChanges, MarkerInput } from "@/lib/db";
import type { DateString, Marker, Project, Task, TaskType } from "@/lib/types";
import type { NewTaskInput } from "./CalendarApp";
import { CreatePopover, type CreateTaskDraft } from "./CreatePopover";
import { EditPopover, type EditTaskDraft } from "./EditPopover";
import { MarkerPopover, type MarkerDraft } from "./MarkerPopover";

// Months shown on either side of today at first paint.
const INITIAL_BACK = 3;
const INITIAL_FWD = 3;
// Distance (px) from a scroll edge that triggers growing the range by one month.
const EXPAND_PX = 600;

// Bar geometry within a week row (px). HEAD_H clears the day-number area; bars
// stack downward in lanes (US-007: lanes are packed via interval scheduling and
// rows beyond DEFAULT_MAX_LANES collapse into per-column "+N개" chips).
const BAR_H = 20;
const BAR_GAP = 3;
const HEAD_H = 30;
const ROW_MIN = 88;

function ymFromDate(date: string): YearMonth {
  const [year, month] = date.split("-").map(Number);
  return { year, month };
}

interface CalendarViewProps {
  projects: Project[];
  taskTypes: TaskType[];
  tasks: Task[];
  /** Point-date markers (event / hard deadline) — US-017. */
  markers: Marker[];
  projectsById: Map<string, Project>;
  taskTypesById: Map<string, TaskType>;
  /** Persist a new task across the committed selection. */
  onCreateTask: (input: NewTaskInput) => Promise<void> | void;
  /** Patch an existing task (title/dates/project/task-type) — US-009. */
  onUpdateTask: (id: string, changes: EditTaskDraft) => Promise<void> | void;
  /** Delete a task — US-009. */
  onDeleteTask: (id: string) => Promise<void> | void;
  /** Persist a new marker — US-017. */
  onCreateMarker: (input: MarkerInput) => Promise<void> | void;
  /** Patch an existing marker (kind/label/date) — US-017. */
  onUpdateMarker: (id: string, changes: MarkerChanges) => Promise<void> | void;
  /** Delete a marker — US-017. */
  onDeleteMarker: (id: string) => Promise<void> | void;
  /** Task whose bar should be ringed (from a panel row click). */
  highlightedTaskId: string | null;
  /** Bumps on each panel click so repeat clicks re-scroll. */
  highlightNonce: number;
  /** Bumps when the panel's "＋ 할일 추가" asks to create for today. */
  addNonce: number;
  /** Bumps when the panel's "＋ 마커 추가" asks to add a marker for today. */
  markerAddNonce: number;
}

export function CalendarView({
  projects,
  taskTypes,
  tasks,
  markers,
  projectsById,
  taskTypesById,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onCreateMarker,
  onUpdateMarker,
  onDeleteMarker,
  highlightedTaskId,
  highlightNonce,
  addNonce,
  markerAddNonce,
}: CalendarViewProps) {
  const today = useMemo(() => todayDateString(), []);
  const todayYM = useMemo(() => ymFromDate(today), [today]);

  const [from, setFrom] = useState<YearMonth>(() => addMonths(todayYM, -INITIAL_BACK));
  const [to, setTo] = useState<YearMonth>(() => addMonths(todayYM, INITIAL_FWD));
  const [title, setTitle] = useState<YearMonth>(todayYM);

  const groups = useMemo(
    () => groupWeeksByMonth(buildWeeksRange(from, to, today)),
    [from, to, today],
  );

  // Markers keyed by date so each cell can render its chips (US-017).
  const markersByDate = useMemo(() => groupMarkersByDate(markers), [markers]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const didInitialScroll = useRef(false);
  // Holds the scrollHeight captured just before a prepend, so the matching
  // layout effect can restore the scroll position after the new month mounts.
  const prependAnchor = useRef<number | null>(null);

  // Center `today` in the viewport. Returns true once it succeeds.
  const centerToday = useCallback((behavior: ScrollBehavior) => {
    const el = scrollRef.current;
    if (!el) return false;
    const cell = el.querySelector<HTMLElement>("[data-today='true']");
    if (!cell) return false;
    const offset =
      cell.getBoundingClientRect().top -
      el.getBoundingClientRect().top -
      el.clientHeight / 2;
    el.scrollTo({ top: el.scrollTop + offset, behavior });
    return true;
  }, []);

  // Auto-scroll to today on first paint.
  useLayoutEffect(() => {
    if (didInitialScroll.current) return;
    if (centerToday("auto")) didInitialScroll.current = true;
  }, [groups, centerToday]);

  // Restore scroll position after a month is prepended above the viewport.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && prependAnchor.current != null) {
      el.scrollTop += el.scrollHeight - prependAnchor.current;
      prependAnchor.current = null;
    }
  }, [from]);

  const updateTitle = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    let current: YearMonth | null = null;
    el.querySelectorAll<HTMLElement>("[data-month-key]").forEach((sec) => {
      if (sec.getBoundingClientRect().top - top <= 8) {
        const [year, month] = sec.dataset.monthKey!.split("-").map(Number);
        current = { year, month };
      }
    });
    if (current) setTitle(current);
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !didInitialScroll.current) return;
    updateTitle();
    if (el.scrollHeight - el.scrollTop - el.clientHeight < EXPAND_PX) {
      setTo((t) => addMonths(t, 1));
    }
    if (el.scrollTop < EXPAND_PX) {
      prependAnchor.current = el.scrollHeight;
      setFrom((f) => addMonths(f, -1));
    }
  }, [updateTitle]);

  // --- Drag-to-select a date range (US-004) ---------------------------------
  // Refs are the source of truth inside the window pointerup handler (state can
  // be stale there); mirror state drives the live highlight render.
  const draggingRef = useRef(false);
  const anchorRef = useRef<DateString | null>(null);
  const currentRef = useRef<DateString | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragAnchor, setDragAnchor] = useState<DateString | null>(null);
  const [dragCurrent, setDragCurrent] = useState<DateString | null>(null);
  const [selection, setSelection] = useState<DateRange | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null);

  const onCellPointerDown = useCallback((date: DateString, e: React.PointerEvent) => {
    // Primary button only; ignore right/middle clicks.
    if (e.button !== 0) return;
    e.preventDefault(); // suppress native text selection while dragging
    setSelection(null);
    setPopoverPos(null);
    draggingRef.current = true;
    anchorRef.current = date;
    currentRef.current = date;
    setIsDragging(true);
    setDragAnchor(date);
    setDragCurrent(date);
  }, []);

  const onCellPointerEnter = useCallback((date: DateString) => {
    if (!draggingRef.current) return;
    currentRef.current = date;
    setDragCurrent(date);
  }, []);

  // Finalize the drag on release anywhere (also catches release outside a cell).
  useEffect(() => {
    function onPointerUp(e: PointerEvent) {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setIsDragging(false);
      const a = anchorRef.current;
      const c = currentRef.current ?? a;
      if (!a || !c) return;
      setSelection(normalizeRange(a, c));
      setPopoverPos({ x: e.clientX, y: e.clientY });
    }
    function onPointerCancel() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setIsDragging(false);
      setDragAnchor(null);
      setDragCurrent(null);
    }
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    return () => {
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    };
  }, []);

  const closePopover = useCallback(() => {
    setSelection(null);
    setPopoverPos(null);
    setDragAnchor(null);
    setDragCurrent(null);
  }, []);

  // Persist a new task across the committed selection (parent owns the data).
  const handleCreate = useCallback(
    async (draft: CreateTaskDraft) => {
      if (!selection) return;
      await onCreateTask({
        projectId: draft.projectId,
        taskTypeId: draft.taskTypeId,
        title: draft.title,
        startDate: selection.start,
        endDate: selection.end,
      });
      closePopover();
    },
    [selection, onCreateTask, closePopover],
  );

  // --- Click a bar -> edit / delete (US-009) --------------------------------
  // Bars carry pointer-events now; clicking one opens the edit popover anchored
  // at the click point. Opening edit clears any pending create selection.
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editPos, setEditPos] = useState<{ x: number; y: number } | null>(null);
  const editingTask = useMemo(
    () => (editingTaskId ? tasks.find((t) => t.id === editingTaskId) ?? null : null),
    [editingTaskId, tasks],
  );

  const openEdit = useCallback((id: string, x: number, y: number) => {
    setSelection(null);
    setPopoverPos(null);
    setEditingTaskId(id);
    setEditPos({ x, y });
  }, []);

  const closeEdit = useCallback(() => {
    setEditingTaskId(null);
    setEditPos(null);
  }, []);

  const handleEditSave = useCallback(
    async (changes: EditTaskDraft) => {
      if (!editingTaskId) return;
      await onUpdateTask(editingTaskId, changes);
      closeEdit();
    },
    [editingTaskId, onUpdateTask, closeEdit],
  );

  const handleEditDelete = useCallback(async () => {
    if (!editingTaskId) return;
    await onDeleteTask(editingTaskId);
    closeEdit();
  }, [editingTaskId, onDeleteTask, closeEdit]);

  // --- Markers: add / click-to-edit (US-017) --------------------------------
  // One popover handles both create (marker:null) and edit. Opening it clears any
  // pending task create/edit so the popovers stay mutually exclusive.
  const [markerPopover, setMarkerPopover] = useState<{
    marker: Marker | null;
    date: DateString;
    x: number;
    y: number;
  } | null>(null);

  const closeTaskPopovers = useCallback(() => {
    setSelection(null);
    setPopoverPos(null);
    setEditingTaskId(null);
    setEditPos(null);
  }, []);

  const openMarkerCreate = useCallback(
    (date: DateString, x: number, y: number) => {
      closeTaskPopovers();
      setMarkerPopover({ marker: null, date, x, y });
    },
    [closeTaskPopovers],
  );

  const openMarkerEdit = useCallback(
    (marker: Marker, x: number, y: number) => {
      closeTaskPopovers();
      setMarkerPopover({ marker, date: marker.date, x, y });
    },
    [closeTaskPopovers],
  );

  const closeMarkerPopover = useCallback(() => setMarkerPopover(null), []);

  const handleMarkerSave = useCallback(
    async (draft: MarkerDraft) => {
      if (!markerPopover) return;
      if (markerPopover.marker) await onUpdateMarker(markerPopover.marker.id, draft);
      else await onCreateMarker(draft);
      closeMarkerPopover();
    },
    [markerPopover, onCreateMarker, onUpdateMarker, closeMarkerPopover],
  );

  const handleMarkerDelete = useCallback(async () => {
    if (!markerPopover?.marker) return;
    await onDeleteMarker(markerPopover.marker.id);
    closeMarkerPopover();
  }, [markerPopover, onDeleteMarker, closeMarkerPopover]);

  // The range to paint as highlighted: the live drag while dragging, otherwise
  // the committed selection (so cells stay lit while the popover is open).
  const highlight = useMemo<DateRange | null>(() => {
    if (isDragging && dragAnchor && dragCurrent) return normalizeRange(dragAnchor, dragCurrent);
    return selection;
  }, [isDragging, dragAnchor, dragCurrent, selection]);

  // --- Lane overflow expand/collapse (US-007) -------------------------------
  // Weeks (keyed by their Sunday date) whose extra lanes are expanded open.
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(() => new Set());
  const toggleWeek = useCallback((key: string) => {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // --- Panel row click -> scroll + ring the bar (US-008) --------------------
  // Expand every week the task spans (so an overflowed bar is drawn) and center
  // its start cell. Both are deferred to the next frame (out of the effect's
  // commit phase). The start-date cell always renders, so the scroll target
  // exists regardless of expand. Keyed on highlightNonce so repeat clicks re-scroll.
  useEffect(() => {
    if (!highlightedTaskId) return;
    const task = tasks.find((t) => t.id === highlightedTaskId);
    if (!task) return;
    const raf = requestAnimationFrame(() => {
      setExpandedWeeks((prev) => {
        const next = new Set(prev);
        for (const key of weekKeysInRange(task.startDate, task.endDate)) next.add(key);
        return next;
      });
      const el = scrollRef.current;
      if (!el) return;
      const cell = el.querySelector<HTMLElement>(`[data-date="${task.startDate}"]`);
      if (!cell) return;
      const offset =
        cell.getBoundingClientRect().top -
        el.getBoundingClientRect().top -
        el.clientHeight / 2;
      el.scrollTo({ top: el.scrollTop + offset, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire on click, not on every tasks change
  }, [highlightNonce]);

  // --- Panel "＋ 할일 추가" -> open the popover for today --------------------
  // Deferred to the next frame so it runs after commit, not synchronously here.
  useEffect(() => {
    if (addNonce === 0) return; // skip the initial mount value
    const raf = requestAnimationFrame(() => {
      setSelection({ start: today, end: today });
      setPopoverPos({ x: window.innerWidth / 2, y: window.innerHeight / 3 });
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire only when the panel requests it
  }, [addNonce]);

  // --- Panel "＋ 마커 추가" -> open the marker form for today (US-017) -------
  useEffect(() => {
    if (markerAddNonce === 0) return; // skip the initial mount value
    const raf = requestAnimationFrame(() => {
      openMarkerCreate(today, window.innerWidth / 2, window.innerHeight / 3);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire only when the panel requests it
  }, [markerAddNonce]);

  return (
    <div className="ed-main">
      <div className="ed-bar">
        <span className="ed-ttl">
          {title.year}
          <span className="sl">/</span>
          {String(title.month).padStart(2, "0")}
        </span>
        <button type="button" className="ed-today" onClick={() => centerToday("smooth")}>
          오늘
        </button>
      </div>

      <div
        className={`ed-calwrap${isDragging ? " is-selecting" : ""}`}
        ref={scrollRef}
        onScroll={onScroll}
      >
        {groups.map((g) => (
          <section className="month-sec" key={g.key} data-month-key={`${g.year}-${g.month + 1}`}>
            <div className="month-head">
              <span className="month-name">{monthLabel(g.year, g.month)}</span>
              <div className="cal-head">
                {WEEKDAYS.map((w) => (
                  <div className="cal-hd" key={w}>
                    {w}
                  </div>
                ))}
              </div>
            </div>
            <div className="month-body">
              {g.weeks.map((week) => {
                // Clip tasks to this week, then pack overlapping bars into lanes.
                // Lanes beyond DEFAULT_MAX_LANES collapse into per-column "+N개"
                // chips unless this week is expanded.
                const weekKey = week[0].date;
                const segs = weekSegments(week, tasks);
                const layout = layoutWeek(segs, DEFAULT_MAX_LANES);
                const expanded = expandedWeeks.has(weekKey);
                const hasOverflow = layout.overflow.length > 0;
                // Lanes drawn as bars, and the lane row the chips sit on.
                const visibleLanes = expanded
                  ? layout.laneCount
                  : Math.min(layout.laneCount, DEFAULT_MAX_LANES);
                const chipLane = expanded ? layout.laneCount : DEFAULT_MAX_LANES;
                const rows = visibleLanes + (hasOverflow ? 1 : 0);
                const weekMinH = Math.max(
                  ROW_MIN,
                  HEAD_H + rows * (BAR_H + BAR_GAP) + 6,
                );
                const visibleSegs = expanded
                  ? layout.segments
                  : layout.segments.filter((s) => s.lane < DEFAULT_MAX_LANES);
                return (
                  <div className="cal-week" key={weekKey} style={{ minHeight: weekMinH }}>
                    {week.map((dy) => {
                      const selected =
                        highlight != null &&
                        isWithinRange(dy.date, highlight.start, highlight.end);
                      const cellMarkers = markersByDate.get(dy.date);
                      return (
                        <div
                          key={dy.date}
                          className={`cal-cell${dy.month !== g.month ? " out" : ""}${
                            dy.isToday ? " today" : ""
                          }${selected ? " sel" : ""}`}
                          data-today={dy.isToday ? "true" : undefined}
                          data-date={dy.date}
                          onPointerDown={(e) => onCellPointerDown(dy.date, e)}
                          onPointerEnter={() => onCellPointerEnter(dy.date)}
                        >
                          <span className="cal-daynum">{dy.day}</span>
                          {/* Point-date markers: monochrome chips (US-017),
                              distinct from the colored task bars. Click to edit;
                              swallow pointerdown so the cell drag-select doesn't
                              start. */}
                          {cellMarkers?.map((mk) => (
                            <button
                              key={mk.id}
                              type="button"
                              className={`mk ${mk.kind === "deadline" ? "mk-dl" : "mk-ev"}`}
                              title={mk.label}
                              aria-label={`${
                                mk.kind === "deadline" ? "데드라인" : "이벤트"
                              } ${mk.label} — 편집`}
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => openMarkerEdit(mk, e.clientX, e.clientY)}
                            >
                              {mk.kind === "deadline" ? "⚑" : "◆"} {mk.label}
                            </button>
                          ))}
                        </div>
                      );
                    })}
                    {visibleSegs.map((seg) => {
                      const project = projectsById.get(seg.task.projectId);
                      const taskType = taskTypesById.get(seg.task.taskTypeId);
                      const left = (seg.startCol / 7) * 100;
                      const width = ((seg.endCol - seg.startCol + 1) / 7) * 100;
                      const top = HEAD_H + seg.lane * (BAR_H + BAR_GAP);
                      // Square the edge that continues into an adjacent week.
                      const r = (cont: boolean) => (cont ? "0" : "3px");
                      // Bar bg = project color toned by task type; text auto-contrast.
                      const { background, text } =
                        project && taskType
                          ? barColors(project.color, taskType)
                          : { background: "var(--text)", text: "#FFFFFF" as const };
                      return (
                        <div
                          key={seg.task.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`${seg.task.title} — 편집`}
                          className={`cal-bar${
                            seg.task.id === highlightedTaskId ? " hl" : ""
                          }`}
                          title={seg.task.title}
                          data-task-id={seg.task.id}
                          style={{
                            left: `${left}%`,
                            width: `calc(${width}% - 4px)`,
                            top,
                            height: BAR_H,
                            background,
                            color: text,
                            borderRadius: `${r(seg.contL)} ${r(seg.contR)} ${r(seg.contR)} ${r(
                              seg.contL,
                            )}`,
                          }}
                          onClick={(e) => openEdit(seg.task.id, e.clientX, e.clientY)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              const rect = e.currentTarget.getBoundingClientRect();
                              openEdit(seg.task.id, rect.left, rect.bottom);
                            }
                          }}
                        >
                          <span className="cal-bar-label">{seg.task.title}</span>
                        </div>
                      );
                    })}
                    {/* Collapsed: per-column "+N개" chips for hidden lanes. */}
                    {hasOverflow &&
                      !expanded &&
                      layout.overflow.map((chip) => (
                        <button
                          key={`more-${chip.col}`}
                          type="button"
                          className="cal-more"
                          style={{
                            left: `${(chip.col / 7) * 100}%`,
                            top: HEAD_H + chipLane * (BAR_H + BAR_GAP),
                          }}
                          onClick={() => toggleWeek(weekKey)}
                          title={`${chip.count}개 더 보기`}
                        >
                          +{chip.count}개
                        </button>
                      ))}
                    {/* Expanded: collapse the extra lanes back. */}
                    {hasOverflow && expanded && (
                      <button
                        type="button"
                        className="cal-more cal-collapse"
                        style={{ left: 0, top: HEAD_H + chipLane * (BAR_H + BAR_GAP) }}
                        onClick={() => toggleWeek(weekKey)}
                      >
                        접기
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {selection && popoverPos && (
        <CreatePopover
          start={selection.start}
          end={selection.end}
          x={popoverPos.x}
          y={popoverPos.y}
          projects={projects}
          taskTypes={taskTypes}
          defaultProjectId={projects[0]?.id ?? null}
          onClose={closePopover}
          onCreate={handleCreate}
        />
      )}

      {editingTask && editPos && (
        <EditPopover
          task={editingTask}
          x={editPos.x}
          y={editPos.y}
          projects={projects}
          taskTypes={taskTypes}
          onClose={closeEdit}
          onSave={handleEditSave}
          onDelete={handleEditDelete}
        />
      )}

      {markerPopover && (
        <MarkerPopover
          marker={markerPopover.marker}
          defaultDate={markerPopover.date}
          x={markerPopover.x}
          y={markerPopover.y}
          onClose={closeMarkerPopover}
          onSave={handleMarkerSave}
          onDelete={markerPopover.marker ? handleMarkerDelete : undefined}
        />
      )}
    </div>
  );
}
