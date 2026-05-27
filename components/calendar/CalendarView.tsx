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
  type CalendarWeek,
  type YearMonth,
} from "@/lib/calendar/infinite";
import { todayDateString } from "@/lib/calendar/dates";
import { isWithinRange, normalizeRange, type DateRange } from "@/lib/calendar/selection";
import { moveTaskByDrag } from "@/lib/calendar/move";
import { resizeRange, type ResizeEdge } from "@/lib/calendar/resize";
import { weekSegments } from "@/lib/calendar/segments";
import { DEFAULT_MAX_LANES, layoutWeek } from "@/lib/calendar/layout";
import { groupMarkersByDate } from "@/lib/calendar/markers";
import { hasNote } from "@/lib/calendar/notes";
import { HEAT_LEVELS, heatLevel, taskDensityByDate } from "@/lib/calendar/heatmap";
import { barColors } from "@/lib/color/compose";
import type { MarkerChanges, MarkerInput } from "@/lib/db";
import type { DateString, Marker, Project, Task, TaskType } from "@/lib/types";
import type { NewTaskInput } from "./CalendarApp";
import { CreatePopover, type CreateDraft } from "./CreatePopover";
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
const BAR_H = 22;
const BAR_GAP = 5;
const HEAD_H = 36;
const ROW_MIN = 116;
// Markers get their own stacked rows between the day number and the task bars,
// so they never sit under a bar. Each marker chip occupies one row of this
// height; a week reserves rows = its busiest cell's marker count.
const MK_ROW_H = 18;

// Pointer travel (px) past which a bar press becomes a move instead of a click
// (US-010): below it the press opens the edit popover, at/above it the bar moves.
const MOVE_THRESHOLD = 4;

function ymFromDate(date: string): YearMonth {
  const [year, month] = date.split("-").map(Number);
  return { year, month };
}

/** The calendar date directly under a viewport point, or null if none. */
function dateUnderPoint(x: number, y: number): DateString | null {
  // elementsFromPoint sees through the bar (which sits above the cells), so we
  // don't need to toggle the bar's pointer-events while dragging.
  for (const el of document.elementsFromPoint(x, y)) {
    const cell = (el as HTMLElement).closest?.<HTMLElement>("[data-date]");
    if (cell?.dataset.date) return cell.dataset.date as DateString;
  }
  return null;
}

/** The project tab id directly under a viewport point, or null if none (US-018). */
function projectTabUnderPoint(x: number, y: number): string | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const tab = (el as HTMLElement).closest?.<HTMLElement>("[data-project-tab]");
    if (tab?.dataset.projectTab) return tab.dataset.projectTab;
  }
  return null;
}

/** Which day of `week` a horizontal viewport position falls on (0=Sun..6=Sat). */
function dateAtClientX(weekEl: HTMLElement, week: CalendarWeek, clientX: number): DateString {
  const rect = weekEl.getBoundingClientRect();
  const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
  const col = Math.min(6, Math.max(0, Math.floor(ratio * 7)));
  return week[col].date;
}

/** In-flight bar drag state (mutable; read by the window pointer handlers). */
interface BarDrag {
  taskId: string;
  startDate: DateString;
  endDate: DateString;
  /** Date the press landed on, used as the move's reference point. */
  grabDate: DateString;
  startX: number;
  startY: number;
  /** True once travel passed MOVE_THRESHOLD (a move, not a click). */
  moved: boolean;
  /** Latest date under the pointer while moving. */
  dropDate: DateString | null;
}

/** In-flight bar edge-resize state (mutable; read by the window handlers). */
interface BarResize {
  taskId: string;
  /** Which edge is dragging: "start" (left) or "end" (right). */
  edge: ResizeEdge;
  startDate: DateString;
  endDate: DateString;
  /** Latest date under the pointer while resizing. */
  overDate: DateString | null;
}

interface CalendarViewProps {
  projects: Project[];
  taskTypes: TaskType[];
  tasks: Task[];
  /** Point-date markers (event / hard deadline) — US-017. */
  markers: Marker[];
  projectsById: Map<string, Project>;
  taskTypesById: Map<string, TaskType>;
  /** Active project tab: null = 전체(통합), else an individual project (US-013). */
  selectedProjectId: string | null;
  /** Switch the active project tab. */
  onSelectProject: (id: string | null) => void;
  /** Reorder project tabs by drag — move `fromId` into `toId`'s slot (US-018). */
  onReorderProject: (fromId: string, toId: string) => Promise<void> | void;
  /** Persist a new task across the committed selection. */
  onCreateTask: (input: NewTaskInput) => Promise<void> | void;
  /** Patch an existing task (title/dates/project/task-type) — US-009. */
  onUpdateTask: (id: string, changes: EditTaskDraft) => Promise<void> | void;
  /** Move a task's dates, preserving its duration — US-010. */
  onMoveTask: (id: string, startDate: DateString, endDate: DateString) => Promise<void> | void;
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
  /** Bumps when the panel's "＋ 일정 추가" asks to create for today. */
  addNonce: number;
  /** Bumps when the panel's "＋ 마커 추가" asks to add a marker for today. */
  markerAddNonce: number;
  /** Print the given inclusive month range (인쇄 기능). */
  onPrint: (from: YearMonth, to: YearMonth) => void;
  /** Open the share popover for the active project (US-025). */
  onShare: (x: number, y: number) => void;
  /** Whether the active project is currently shared (button state). */
  isShared: boolean;
  /** A collaborator edited the shared copy since the owner's last sync. */
  shareStale?: boolean;
  /**
   * Whether to show the 공유 button (default true). The edit-link page reuses
   * this view to let a collaborator edit, but they can't re-share, so it's
   * hidden there.
   */
  canShare?: boolean;
}

export function CalendarView({
  projects,
  taskTypes,
  tasks,
  markers,
  projectsById,
  taskTypesById,
  selectedProjectId,
  onSelectProject,
  onReorderProject,
  onCreateTask,
  onUpdateTask,
  onMoveTask,
  onDeleteTask,
  onCreateMarker,
  onUpdateMarker,
  onDeleteMarker,
  highlightedTaskId,
  highlightNonce,
  addNonce,
  markerAddNonce,
  onPrint,
  onShare,
  isShared,
  shareStale = false,
  canShare = true,
}: CalendarViewProps) {
  const today = useMemo(() => todayDateString(), []);
  const todayYM = useMemo(() => ymFromDate(today), [today]);

  const [from, setFrom] = useState<YearMonth>(() => addMonths(todayYM, -INITIAL_BACK));
  const [to, setTo] = useState<YearMonth>(() => addMonths(todayYM, INITIAL_FWD));
  const [title, setTitle] = useState<YearMonth>(todayYM);

  // 인쇄(Print): scope popover. Defaults to the current title month; the user
  // can widen it to a month range (each month prints on its own page).
  const [printOpen, setPrintOpen] = useState(false);
  const [printFrom, setPrintFrom] = useState("");
  const [printTo, setPrintTo] = useState("");
  const ymToInput = (ym: YearMonth) => `${ym.year}-${String(ym.month).padStart(2, "0")}`;
  const openPrint = () => {
    const v = ymToInput(title);
    setPrintFrom(v);
    setPrintTo(v);
    setPrintOpen(true);
  };
  const confirmPrint = () => {
    const parse = (s: string): YearMonth => {
      const [y, m] = s.split("-").map(Number);
      return { year: y, month: m };
    };
    let a = parse(printFrom);
    let b = parse(printTo);
    if (a.year * 12 + a.month > b.year * 12 + b.month) [a, b] = [b, a];
    setPrintOpen(false);
    onPrint(a, b);
  };

  const groups = useMemo(
    () => groupWeeksByMonth(buildWeeksRange(from, to, today)),
    [from, to, today],
  );

  // Markers keyed by date so each cell can render its chips (US-017).
  const markersByDate = useMemo(() => groupMarkersByDate(markers), [markers]);

  // --- Density heatmap (US-022) ---------------------------------------------
  // Only on the 전체(통합) view: shade each cell by how many tasks overlap that
  // day. Toggling off (or switching to an individual project) restores the plain
  // grid. The density is computed from the visible tasks so the shading matches
  // the bars actually shown; monochrome only (color stays on the bars).
  const [heatmapOn, setHeatmapOn] = useState(false);
  const heatmapActive = heatmapOn && selectedProjectId === null;
  const densityByDate = useMemo(
    () => (heatmapActive ? taskDensityByDate(tasks) : null),
    [heatmapActive, tasks],
  );

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

  // Persist what the create popover returns (parent owns the data): a task
  // spans the committed selection; a marker (event/deadline) lands on the
  // selection's start day, since markers are point-date.
  const handleCreate = useCallback(
    async (draft: CreateDraft) => {
      if (!selection) return;
      if (draft.kind === "task") {
        await onCreateTask({
          projectId: draft.projectId,
          taskTypeId: draft.taskTypeId,
          title: draft.title,
          startDate: selection.start,
          endDate: selection.end,
          note: draft.note,
        });
      } else {
        await onCreateMarker({
          kind: draft.markerKind,
          label: draft.label,
          date: selection.start,
          projectId: draft.projectId,
        });
      }
      closePopover();
    },
    [selection, onCreateTask, onCreateMarker, closePopover],
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

  // --- Drag a bar to move its dates (US-010) --------------------------------
  // A press records a candidate drag; once travel passes MOVE_THRESHOLD it
  // becomes a move (else it stays a click -> edit, US-009). The grabbed date is
  // the reference point: the whole span shifts so it lands on the dropped date,
  // preserving duration across week/month boundaries (lib/calendar/move.ts).
  const barDragRef = useRef<BarDrag | null>(null);
  // Set when a move commits so the trailing click doesn't also open the editor.
  const justDraggedRef = useRef(false);
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);
  const [movePreview, setMovePreview] = useState<DateRange | null>(null);

  const onBarPointerDown = useCallback(
    (task: Task, week: CalendarWeek, e: React.PointerEvent) => {
      if (e.button !== 0) return; // primary button only
      justDraggedRef.current = false;
      const weekEl = (e.currentTarget as HTMLElement).closest<HTMLElement>(".cal-week");
      const grabDate = weekEl ? dateAtClientX(weekEl, week, e.clientX) : task.startDate;
      barDragRef.current = {
        taskId: task.id,
        startDate: task.startDate,
        endDate: task.endDate,
        grabDate,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        dropDate: null,
      };
    },
    [],
  );

  // Window-level move/up so the drag continues even when the pointer leaves the
  // bar (it almost always does). Refs are the source of truth here; state only
  // drives the live preview render.
  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = barDragRef.current;
      if (!d) return;
      if (!d.moved) {
        if (
          Math.abs(e.clientX - d.startX) < MOVE_THRESHOLD &&
          Math.abs(e.clientY - d.startY) < MOVE_THRESHOLD
        ) {
          return;
        }
        d.moved = true;
        setMovingTaskId(d.taskId);
      }
      const drop = dateUnderPoint(e.clientX, e.clientY);
      if (!drop) return; // off the grid: keep the last preview
      d.dropDate = drop;
      setMovePreview(moveTaskByDrag(d.startDate, d.endDate, d.grabDate, drop));
    }
    function onUp() {
      const d = barDragRef.current;
      if (!d) return;
      barDragRef.current = null;
      if (!d.moved) return; // a plain click -> let onClick open the editor
      justDraggedRef.current = true;
      setMovingTaskId(null);
      setMovePreview(null);
      if (d.dropDate) {
        const { start, end } = moveTaskByDrag(d.startDate, d.endDate, d.grabDate, d.dropDate);
        if (start !== d.startDate || end !== d.endDate) {
          void onMoveTask(d.taskId, start, end);
        }
      }
    }
    function onCancel() {
      if (!barDragRef.current) return;
      barDragRef.current = null;
      setMovingTaskId(null);
      setMovePreview(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [onMoveTask]);

  // --- Drag a bar edge to resize its span (US-016) --------------------------
  // The left/right resize handles sit on the bar's start/end edges (only on the
  // segment that owns that edge, i.e. not a week continuation). Pressing a handle
  // begins a resize immediately (it's a dedicated affordance, so no move/click
  // threshold) and stops propagation so the move/select drag never starts. The
  // dragged edge follows the date under the pointer, clamped so start <= end
  // (lib/calendar/resize.ts). Releasing persists via onMoveTask (it just writes
  // the new start/end dates — same as a move).
  const barResizeRef = useRef<BarResize | null>(null);
  const [resizingTaskId, setResizingTaskId] = useState<string | null>(null);
  const [resizePreview, setResizePreview] = useState<DateRange | null>(null);

  const onResizeHandlePointerDown = useCallback(
    (task: Task, edge: ResizeEdge, e: React.PointerEvent) => {
      if (e.button !== 0) return; // primary button only
      e.stopPropagation(); // don't start a bar move or a cell selection
      e.preventDefault();
      justDraggedRef.current = false;
      barResizeRef.current = {
        taskId: task.id,
        edge,
        startDate: task.startDate,
        endDate: task.endDate,
        overDate: null,
      };
      setResizingTaskId(task.id);
      setResizePreview({ start: task.startDate, end: task.endDate });
    },
    [],
  );

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const r = barResizeRef.current;
      if (!r) return;
      const over = dateUnderPoint(e.clientX, e.clientY);
      if (!over) return; // off the grid: keep the last preview
      r.overDate = over;
      setResizePreview(resizeRange(r.startDate, r.endDate, r.edge, over));
    }
    function onUp() {
      const r = barResizeRef.current;
      if (!r) return;
      barResizeRef.current = null;
      // Swallow the trailing click so the editor doesn't open after a resize.
      justDraggedRef.current = true;
      setResizingTaskId(null);
      setResizePreview(null);
      if (r.overDate) {
        const { start, end } = resizeRange(r.startDate, r.endDate, r.edge, r.overDate);
        if (start !== r.startDate || end !== r.endDate) {
          void onMoveTask(r.taskId, start, end);
        }
      }
    }
    function onCancel() {
      if (!barResizeRef.current) return;
      barResizeRef.current = null;
      setResizingTaskId(null);
      setResizePreview(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [onMoveTask]);

  // --- Drag a project tab to reorder (US-018) -------------------------------
  // A press on a project tab records a candidate drag; once travel passes
  // MOVE_THRESHOLD it becomes a reorder (else it stays a click -> view switch,
  // US-013, AC4). The tab under the pointer is the drop target; releasing
  // persists the new order via onReorderProject. justReorderedRef swallows the
  // trailing click so a reorder doesn't also switch the view.
  const tabDragRef = useRef<{
    fromId: string;
    startX: number;
    startY: number;
    moved: boolean;
    overId: string | null;
  } | null>(null);
  const justReorderedRef = useRef(false);
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const onTabPointerDown = useCallback((projectId: string, e: React.PointerEvent) => {
    if (e.button !== 0) return; // primary button only
    justReorderedRef.current = false;
    tabDragRef.current = {
      fromId: projectId,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      overId: null,
    };
  }, []);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = tabDragRef.current;
      if (!d) return;
      if (!d.moved) {
        if (
          Math.abs(e.clientX - d.startX) < MOVE_THRESHOLD &&
          Math.abs(e.clientY - d.startY) < MOVE_THRESHOLD
        ) {
          return;
        }
        d.moved = true;
        setDraggingProjectId(d.fromId);
      }
      const over = projectTabUnderPoint(e.clientX, e.clientY);
      d.overId = over;
      setDropTargetId(over && over !== d.fromId ? over : null);
    }
    function onUp() {
      const d = tabDragRef.current;
      if (!d) return;
      tabDragRef.current = null;
      setDraggingProjectId(null);
      setDropTargetId(null);
      if (!d.moved) return; // a plain click -> let onClick switch the view
      justReorderedRef.current = true;
      if (d.overId && d.overId !== d.fromId) {
        void onReorderProject(d.fromId, d.overId);
      }
    }
    function onCancel() {
      if (!tabDragRef.current) return;
      tabDragRef.current = null;
      setDraggingProjectId(null);
      setDropTargetId(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [onReorderProject]);

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

  // The range to paint as highlighted: while resizing an edge, the previewed
  // span (US-016); while moving a bar, the previewed drop range (US-010); while
  // drag-selecting, the live range; otherwise the committed selection (so cells
  // stay lit while the popover is open).
  const highlight = useMemo<DateRange | null>(() => {
    if (resizePreview) return resizePreview;
    if (movePreview) return movePreview;
    if (isDragging && dragAnchor && dragCurrent) return normalizeRange(dragAnchor, dragCurrent);
    return selection;
  }, [resizePreview, movePreview, isDragging, dragAnchor, dragCurrent, selection]);

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

  // --- Panel "＋ 일정 추가" -> open the popover for today --------------------
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
        <button type="button" className="ed-today ed-print" onClick={openPrint}>
          인쇄
        </button>
        {/* Share (US-025): only on an individual project view. Dot when shared. */}
        {canShare && selectedProjectId !== null && (
          <button
            type="button"
            className={`ed-today ed-share${isShared ? " on" : ""}${
              shareStale ? " stale" : ""
            }`}
            onClick={(e) => onShare(e.clientX, e.clientY)}
            title={shareStale ? "협업자가 편집했어요 — 가져오기" : undefined}
          >
            {isShared && <span className="ed-share-dot" aria-hidden />}
            공유{shareStale && "•"}
          </button>
        )}
        {/* Heatmap toggle (US-022): only on the 전체(통합) view. Filled when on. */}
        {selectedProjectId === null && (
          <button
            type="button"
            className={`ed-today heat-toggle${heatmapOn ? " on" : ""}`}
            aria-pressed={heatmapOn}
            onClick={() => setHeatmapOn((v) => !v)}
          >
            히트맵
          </button>
        )}
      </div>

      {/* Project tabs (US-013): 전체(통합) + each project, underline-active. The
          merged view shows all bars (distinguished by hue); an individual tab
          filters to that project (task-type tone preserved). Project identity
          colors are allowed on the dot (color-system §2), unlike grid chrome. */}
      <div
        className={`ptabs${draggingProjectId ? " is-reordering" : ""}`}
        role="tablist"
        aria-label="프로젝트 뷰"
      >
        <button
          type="button"
          role="tab"
          aria-selected={selectedProjectId === null}
          className={`ptab${selectedProjectId === null ? " on" : ""}`}
          onClick={() => onSelectProject(null)}
        >
          전체
        </button>
        {/* Each project tab switches the view on click and reorders on drag
            (US-018). data-project-tab lets the drop target be found by point. */}
        {projects.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={selectedProjectId === p.id}
            data-project-tab={p.id}
            className={`ptab${selectedProjectId === p.id ? " on" : ""}${
              p.id === draggingProjectId ? " tab-dragging" : ""
            }${p.id === dropTargetId ? " drop-target" : ""}`}
            onPointerDown={(e) => onTabPointerDown(p.id, e)}
            onClick={() => {
              // Swallow the click that trails a committed reorder so the drag
              // doesn't also switch the view (AC4: click vs drag).
              if (justReorderedRef.current) {
                justReorderedRef.current = false;
                return;
              }
              onSelectProject(p.id);
            }}
          >
            <span className="pd" style={{ background: p.color }} aria-hidden />
            {p.name}
          </button>
        ))}
      </div>

      {/* Density shade scale legend (US-022): shown while the heatmap is active.
          Monochrome swatches from few (light) to many (dark). */}
      {heatmapActive && (
        <div className="heat-legend" aria-label="일정 밀도 범례">
          <span className="heat-legend-label">밀도</span>
          <span className="heat-legend-scale" aria-hidden>
            {Array.from({ length: HEAT_LEVELS }, (_, i) => i + 1).map((l) => (
              <span
                key={l}
                className={`heat-sw heat-${l}`}
                title={l === HEAT_LEVELS ? `${l}개 이상` : `${l}개`}
              />
            ))}
          </span>
          <span className="heat-legend-ends">적음 → 많음</span>
        </div>
      )}

      <div
        className={`ed-calwrap${isDragging ? " is-selecting" : ""}${
          movingTaskId ? " is-moving" : ""
        }${resizingTaskId ? " is-resizing" : ""}`}
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
                // Reserve a marker band above the bars: as many rows as the
                // busiest cell in this week, so markers stack on their own lines
                // and bars start below them (no overlap). +4 keeps a hair of gap.
                const markerRows = week.reduce(
                  (m, dy) => Math.max(m, markersByDate.get(dy.date)?.length ?? 0),
                  0,
                );
                const markerBandH = markerRows > 0 ? markerRows * MK_ROW_H + 4 : 0;
                // Lanes drawn as bars, and the lane row the chips sit on.
                const visibleLanes = expanded
                  ? layout.laneCount
                  : Math.min(layout.laneCount, DEFAULT_MAX_LANES);
                const chipLane = expanded ? layout.laneCount : DEFAULT_MAX_LANES;
                const rows = visibleLanes + (hasOverflow ? 1 : 0);
                const barTop = HEAD_H + markerBandH;
                const weekMinH = Math.max(
                  ROW_MIN,
                  barTop + rows * (BAR_H + BAR_GAP) + 6,
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
                      // Density shade (US-022): 0 = none, else heat-1..HEAT_LEVELS.
                      const heat = densityByDate
                        ? heatLevel(densityByDate.get(dy.date) ?? 0)
                        : 0;
                      return (
                        <div
                          key={dy.date}
                          className={`cal-cell${dy.month !== g.month ? " out" : ""}${
                            dy.isToday ? " today" : ""
                          }${heat ? ` heat-${heat}` : ""}${selected ? " sel" : ""}`}
                          data-today={dy.isToday ? "true" : undefined}
                          data-date={dy.date}
                          onPointerDown={(e) => onCellPointerDown(dy.date, e)}
                          onPointerEnter={() => onCellPointerEnter(dy.date)}
                        >
                          <span className="cal-daynum">{dy.day}</span>
                          {/* Point-date markers (US-017): monochrome chips on
                              their own stacked rows between the day number and the
                              task bars, so multiple markers never hide under a bar.
                              Full cell width; long labels truncate with a tooltip.
                              Click to edit; swallow pointerdown so the cell
                              drag-select doesn't start. */}
                          {cellMarkers && cellMarkers.length > 0 && (
                            <div className="cal-marks">
                              {cellMarkers.map((mk) => (
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
                          )}
                        </div>
                      );
                    })}
                    {visibleSegs.map((seg) => {
                      const project = projectsById.get(seg.task.projectId);
                      const taskType = taskTypesById.get(seg.task.taskTypeId);
                      const left = (seg.startCol / 7) * 100;
                      const width = ((seg.endCol - seg.startCol + 1) / 7) * 100;
                      const top = barTop + seg.lane * (BAR_H + BAR_GAP);
                      // Square the edge that continues into an adjacent week.
                      const r = (cont: boolean) => (cont ? "0" : "3px");
                      // Bar bg = project color toned by task type; text auto-contrast.
                      const { background, text } =
                        project && taskType
                          ? barColors(project.color, taskType)
                          : { background: "var(--text)", text: "#FFFFFF" as const };
                      const noted = hasNote(seg.task);
                      return (
                        <div
                          key={seg.task.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`${seg.task.title} — 편집${noted ? " (메모 있음)" : ""}`}
                          className={`cal-bar${
                            seg.task.id === highlightedTaskId ? " hl" : ""
                          }${seg.task.id === movingTaskId ? " dragging" : ""}${
                            seg.task.id === resizingTaskId ? " resizing" : ""
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
                          onPointerDown={(e) => onBarPointerDown(seg.task, week, e)}
                          onClick={(e) => {
                            // Swallow the click that trails a committed move so the
                            // editor doesn't open after a drag (US-010 vs US-009).
                            if (justDraggedRef.current) {
                              justDraggedRef.current = false;
                              return;
                            }
                            openEdit(seg.task.id, e.clientX, e.clientY);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              const rect = e.currentTarget.getBoundingClientRect();
                              openEdit(seg.task.id, rect.left, rect.bottom);
                            }
                          }}
                        >
                          {/* Note indicator (US-019): a small dot in the bar's
                              text color, shown on the leading segment so a
                              multi-week bar flags its note just once. */}
                          {noted && !seg.contL && (
                            <span className="cal-bar-note" aria-hidden />
                          )}
                          <span className="cal-bar-label">{seg.task.title}</span>
                          {/* Edge resize handles (US-016). Only on the segment
                              that owns the edge (not a week continuation), so a
                              split bar gets one start handle and one end handle.
                              stopPropagation in the handler keeps the move/select
                              drag from starting; this onClick swallows the click
                              so a handle tap doesn't open the editor. */}
                          {!seg.contL && (
                            <span
                              className="cal-bar-resize l"
                              aria-hidden
                              onPointerDown={(e) =>
                                onResizeHandlePointerDown(seg.task, "start", e)
                              }
                              onClick={(e) => e.stopPropagation()}
                            />
                          )}
                          {!seg.contR && (
                            <span
                              className="cal-bar-resize r"
                              aria-hidden
                              onPointerDown={(e) =>
                                onResizeHandlePointerDown(seg.task, "end", e)
                              }
                              onClick={(e) => e.stopPropagation()}
                            />
                          )}
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
                            top: barTop + chipLane * (BAR_H + BAR_GAP),
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
                        style={{ left: 0, top: barTop + chipLane * (BAR_H + BAR_GAP) }}
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
          defaultProjectId={selectedProjectId}
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
          projects={projects}
          defaultProjectId={selectedProjectId}
          x={markerPopover.x}
          y={markerPopover.y}
          onClose={closeMarkerPopover}
          onSave={handleMarkerSave}
          onDelete={markerPopover.marker ? handleMarkerDelete : undefined}
        />
      )}

      {/* 인쇄 범위 팝오버: 시작/종료 달(기본=현재 달). 확인 시 onPrint → 인쇄. */}
      {printOpen && (
        <div className="cp-backdrop" onPointerDown={() => setPrintOpen(false)}>
          <div
            className="create-pop print-pop"
            role="dialog"
            aria-label="캘린더 인쇄"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="cp-head">
              <span className="cp-title">캘린더 인쇄</span>
              <button
                type="button"
                className="cp-x"
                aria-label="닫기"
                onClick={() => setPrintOpen(false)}
              >
                ✕
              </button>
            </div>
            <form
              className="cp-form"
              onSubmit={(e) => {
                e.preventDefault();
                confirmPrint();
              }}
            >
              <div className="cp-row">
                <label className="cp-field">
                  <span className="cp-label">시작 달</span>
                  <input
                    type="month"
                    className="cp-input"
                    value={printFrom}
                    onChange={(e) => setPrintFrom(e.target.value)}
                  />
                </label>
                <label className="cp-field">
                  <span className="cp-label">종료 달</span>
                  <input
                    type="month"
                    className="cp-input"
                    value={printTo}
                    onChange={(e) => setPrintTo(e.target.value)}
                  />
                </label>
              </div>
              <p className="pp-hint">선택한 달을 가로(A4) 한 장씩 인쇄해요.</p>
              <button type="submit" className="cp-save">
                인쇄
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
