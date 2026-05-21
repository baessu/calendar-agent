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
 * range; a single click selects one day. No bars/markers here yet — those land
 * in US-005 / US-017. The grid is the line-less minimal Swiss layout from the
 * F-tab mockup.
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
  WEEKDAYS,
  type YearMonth,
} from "@/lib/calendar/infinite";
import { todayDateString } from "@/lib/calendar/dates";
import { isWithinRange, normalizeRange, type DateRange } from "@/lib/calendar/selection";
import { weekSegments } from "@/lib/calendar/segments";
import { barColors } from "@/lib/color/compose";
import {
  createTask,
  getAllProjects,
  getAllTaskTypes,
  getAllTasks,
  seedIfEmpty,
} from "@/lib/db";
import type { DateString, Project, Task, TaskType } from "@/lib/types";
import { CreatePopover, type CreateTaskDraft } from "./CreatePopover";

// Months shown on either side of today at first paint.
const INITIAL_BACK = 3;
const INITIAL_FWD = 3;
// Distance (px) from a scroll edge that triggers growing the range by one month.
const EXPAND_PX = 600;

// Bar geometry within a week row (px). HEAD_H clears the day-number area; bars
// stack downward in lanes. US-007 replaces the naive one-lane-per-segment
// stacking with packed lanes + a "+N개" overflow summary.
const BAR_H = 20;
const BAR_GAP = 3;
const HEAD_H = 30;
const ROW_MIN = 88;

function ymFromDate(date: string): YearMonth {
  const [year, month] = date.split("-").map(Number);
  return { year, month };
}

export function CalendarView() {
  const today = useMemo(() => todayDateString(), []);
  const todayYM = useMemo(() => ymFromDate(today), [today]);

  const [from, setFrom] = useState<YearMonth>(() => addMonths(todayYM, -INITIAL_BACK));
  const [to, setTo] = useState<YearMonth>(() => addMonths(todayYM, INITIAL_FWD));
  const [title, setTitle] = useState<YearMonth>(todayYM);

  const groups = useMemo(
    () => groupWeeksByMonth(buildWeeksRange(from, to, today)),
    [from, to, today],
  );

  // --- Persisted data (US-005) ----------------------------------------------
  const [projects, setProjects] = useState<Project[]>([]);
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  // Seed (idempotent) then load all data on mount. Seeding here too avoids a
  // race with <DbInit>, so the popover always has a project/task-type to pick.
  useEffect(() => {
    let alive = true;
    (async () => {
      await seedIfEmpty();
      const [ps, tts, ts] = await Promise.all([
        getAllProjects(),
        getAllTaskTypes(),
        getAllTasks(),
      ]);
      if (!alive) return;
      setProjects(ps);
      setTaskTypes(tts);
      setTasks(ts);
    })().catch((err) => console.error("calendar data load failed", err));
    return () => {
      alive = false;
    };
  }, []);

  const projectsById = useMemo(() => {
    const m = new Map<string, Project>();
    for (const p of projects) m.set(p.id, p);
    return m;
  }, [projects]);

  const taskTypesById = useMemo(() => {
    const m = new Map<string, TaskType>();
    for (const tt of taskTypes) m.set(tt.id, tt);
    return m;
  }, [taskTypes]);

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

  // Persist a new task across the committed selection, then show its bar.
  const handleCreate = useCallback(
    async (draft: CreateTaskDraft) => {
      if (!selection) return;
      const task = await createTask({
        projectId: draft.projectId,
        taskTypeId: draft.taskTypeId,
        title: draft.title,
        startDate: selection.start,
        endDate: selection.end,
      });
      setTasks((prev) => [...prev, task]);
      closePopover();
    },
    [selection, closePopover],
  );

  // The range to paint as highlighted: the live drag while dragging, otherwise
  // the committed selection (so cells stay lit while the popover is open).
  const highlight = useMemo<DateRange | null>(() => {
    if (isDragging && dragAnchor && dragCurrent) return normalizeRange(dragAnchor, dragCurrent);
    return selection;
  }, [isDragging, dragAnchor, dragCurrent, selection]);

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
                // Clip tasks to this week; one lane per segment for now (US-007
                // packs lanes + adds overflow). Row grows to fit the lanes.
                const segs = weekSegments(week, tasks);
                const weekMinH = Math.max(
                  ROW_MIN,
                  HEAD_H + segs.length * (BAR_H + BAR_GAP) + 6,
                );
                return (
                  <div className="cal-week" key={week[0].date} style={{ minHeight: weekMinH }}>
                    {week.map((dy) => {
                      const selected =
                        highlight != null &&
                        isWithinRange(dy.date, highlight.start, highlight.end);
                      return (
                        <div
                          key={dy.date}
                          className={`cal-cell${dy.month !== g.month ? " out" : ""}${
                            dy.isToday ? " today" : ""
                          }${selected ? " sel" : ""}`}
                          data-today={dy.isToday ? "true" : undefined}
                          onPointerDown={(e) => onCellPointerDown(dy.date, e)}
                          onPointerEnter={() => onCellPointerEnter(dy.date)}
                        >
                          <span className="cal-daynum">{dy.day}</span>
                        </div>
                      );
                    })}
                    {segs.map((seg, lane) => {
                      const project = projectsById.get(seg.task.projectId);
                      const taskType = taskTypesById.get(seg.task.taskTypeId);
                      const left = (seg.startCol / 7) * 100;
                      const width = ((seg.endCol - seg.startCol + 1) / 7) * 100;
                      const top = HEAD_H + lane * (BAR_H + BAR_GAP);
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
                          className="cal-bar"
                          title={seg.task.title}
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
                        >
                          <span className="cal-bar-label">{seg.task.title}</span>
                        </div>
                      );
                    })}
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
    </div>
  );
}
