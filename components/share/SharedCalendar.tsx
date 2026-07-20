"use client";

/**
 * Public read-only share view (US-024).
 *
 * Renders a published snapshot exactly like the app's calendar — same classes,
 * same colors, same layout — but with no editing (no drag/resize/create). On
 * screen it shows the scrollable month grids (<StaticMonths>) alongside a
 * read-only right panel (<TaskListPanel readOnly>): the panel lists tasks and
 * markers, its rows scroll the matching date into view and ring it (the same
 * US-008 affordance as the app), and the task-type filter still toggles. The
 * 인쇄 button reuses the app's existing print CSS by mounting <PrintCalendar>,
 * which is hidden on screen and printed A4-landscape. The on-screen view is
 * hidden during print via `.share-screen`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PrintCalendar } from "@/components/calendar/PrintCalendar";
import { TaskListPanel } from "@/components/calendar/TaskListPanel";
import { filterTasksByTaskTypes } from "@/lib/calendar/view";
import { StaticMonths } from "./StaticMonths";
import type { ShareSnapshot } from "@/lib/share/snapshot";
import type { Project, TaskType } from "@/lib/types";

// How long a panel-row click keeps its calendar target ringed (mirrors the app).
const HIGHLIGHT_MS = 1800;

export function SharedCalendar({ snapshot }: { snapshot: ShareSnapshot }) {
  const project: Project = useMemo(
    () => ({
      id: snapshot.project.id,
      name: snapshot.project.name,
      color: snapshot.project.color,
      visible: true,
      order: 0,
      createdAt: snapshot.publishedAt,
      updatedAt: snapshot.publishedAt,
    }),
    [snapshot.project, snapshot.publishedAt],
  );

  const projectsById = useMemo(
    () => new Map<string, Project>([[project.id, project]]),
    [project],
  );
  const taskTypesById = useMemo(
    () => new Map<string, TaskType>(snapshot.taskTypes.map((tt) => [tt.id, tt])),
    [snapshot.taskTypes],
  );

  // Task-type filter (US-015) — the one interactive control we keep read-only.
  // Markers have no task type, so the filter narrows tasks only.
  const [hiddenTaskTypeIds, setHiddenTaskTypeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const handleToggleTaskType = useCallback((id: string) => {
    setHiddenTaskTypeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const visibleTasks = useMemo(
    () => filterTasksByTaskTypes(snapshot.tasks, hiddenTaskTypeIds),
    [snapshot.tasks, hiddenTaskTypeIds],
  );

  // --- Panel row click -> scroll the static grid + ring the target ----------
  const scrollRef = useRef<HTMLDivElement>(null);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [highlightNonce, setHighlightNonce] = useState(0);
  const hlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [highlightedMarkerId, setHighlightedMarkerId] = useState<string | null>(null);
  const [markerHighlightNonce, setMarkerHighlightNonce] = useState(0);
  const mkHlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSelectTask = useCallback((id: string) => {
    setHighlightedTaskId(id);
    setHighlightNonce((n) => n + 1);
    if (hlTimer.current) clearTimeout(hlTimer.current);
    hlTimer.current = setTimeout(() => setHighlightedTaskId(null), HIGHLIGHT_MS);
  }, []);
  const handleSelectMarker = useCallback((id: string) => {
    setHighlightedMarkerId(id);
    setMarkerHighlightNonce((n) => n + 1);
    if (mkHlTimer.current) clearTimeout(mkHlTimer.current);
    mkHlTimer.current = setTimeout(() => setHighlightedMarkerId(null), HIGHLIGHT_MS);
  }, []);
  useEffect(
    () => () => {
      if (hlTimer.current) clearTimeout(hlTimer.current);
      if (mkHlTimer.current) clearTimeout(mkHlTimer.current);
    },
    [],
  );

  // Center the clicked task's start-date cell. StaticMonths renders every week
  // (no virtualization), so the target cell always exists. Keyed on the nonce so
  // re-clicking the same row re-scrolls.
  useEffect(() => {
    if (!highlightedTaskId) return;
    const task = snapshot.tasks.find((t) => t.id === highlightedTaskId);
    if (!task) return;
    const raf = requestAnimationFrame(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire on click, not on data change
  }, [highlightNonce]);

  useEffect(() => {
    if (!highlightedMarkerId) return;
    const mk = snapshot.markers.find((m) => m.id === highlightedMarkerId);
    if (!mk) return;
    const raf = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      const cell = el.querySelector<HTMLElement>(`[data-date="${mk.date}"]`);
      if (!cell) return;
      const offset =
        cell.getBoundingClientRect().top -
        el.getBoundingClientRect().top -
        el.clientHeight / 2;
      el.scrollTo({ top: el.scrollTop + offset, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire on click, not on data change
  }, [markerHighlightNonce]);

  const { from, to } = snapshot.range;
  const publishedLabel = new Date(snapshot.publishedAt).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="share-page">
      <header className="share-bar share-screen">
        <div className="share-id">
          <span className="share-dot" style={{ background: project.color }} aria-hidden />
          <div>
            <h1 className="share-ttl">{project.name}</h1>
            <p className="share-sub">공유된 캘린더 · {publishedLabel} 발행</p>
          </div>
        </div>
        <button
          type="button"
          className="share-print"
          onClick={() => window.print()}
        >
          인쇄
        </button>
      </header>

      {/* On-screen, scrollable read-only render (hidden while printing): the
          month grids + a read-only panel. */}
      <div className="share-body share-screen">
        <div className="share-cal" ref={scrollRef}>
          <StaticMonths
            from={from}
            to={to}
            tasks={visibleTasks}
            markers={snapshot.markers}
            projectsById={projectsById}
            taskTypesById={taskTypesById}
            highlightedTaskId={highlightedTaskId}
            highlightedMarkerId={highlightedMarkerId}
          />
        </div>
        <TaskListPanel
          readOnly
          tasks={visibleTasks}
          markers={snapshot.markers}
          projects={[project]}
          projectsById={projectsById}
          taskTypesById={taskTypesById}
          selectedProjectId={project.id}
          projectTaskTypes={snapshot.taskTypes}
          onSelectTask={handleSelectTask}
          selectedTaskId={highlightedTaskId}
          onSelectMarker={handleSelectMarker}
          selectedMarkerId={highlightedMarkerId}
          hiddenTaskTypeIds={hiddenTaskTypeIds}
          onToggleTaskType={handleToggleTaskType}
        />
      </div>

      {/* Print-only render (display:none on screen, A4-landscape on print). */}
      <PrintCalendar
        from={from}
        to={to}
        tasks={visibleTasks}
        markers={snapshot.markers}
        projectsById={projectsById}
        taskTypesById={taskTypesById}
      />
    </div>
  );
}
