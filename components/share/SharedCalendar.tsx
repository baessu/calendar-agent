"use client";

/**
 * Public read-only share view (US-024).
 *
 * Renders a published snapshot exactly like the app's calendar — same classes,
 * same colors, same layout — but with no interactivity (no drag/resize/edit/
 * create). On screen it shows the scrollable month grids (<StaticMonths>); the
 * 인쇄 button reuses the app's existing print CSS by mounting <PrintCalendar>,
 * which is hidden on screen and printed A4-landscape. The on-screen view is
 * hidden during print via `.share-screen`.
 */
import { useMemo } from "react";
import { PrintCalendar } from "@/components/calendar/PrintCalendar";
import { StaticMonths } from "./StaticMonths";
import type { ShareSnapshot } from "@/lib/share/snapshot";
import type { Project, TaskType } from "@/lib/types";

export function SharedCalendar({ snapshot }: { snapshot: ShareSnapshot }) {
  const project: Project = useMemo(
    () => ({
      id: snapshot.project.id,
      name: snapshot.project.name,
      color: snapshot.project.color,
      visible: true,
      order: 0,
      createdAt: snapshot.publishedAt,
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

      {/* On-screen, scrollable read-only render (hidden while printing). */}
      <div className="share-cal share-screen">
        <StaticMonths
          from={from}
          to={to}
          tasks={snapshot.tasks}
          markers={snapshot.markers}
          projectsById={projectsById}
          taskTypesById={taskTypesById}
        />
      </div>

      {/* Print-only render (display:none on screen, A4-landscape on print). */}
      <PrintCalendar
        from={from}
        to={to}
        tasks={snapshot.tasks}
        markers={snapshot.markers}
        projectsById={projectsById}
        taskTypesById={taskTypesById}
      />
    </div>
  );
}
