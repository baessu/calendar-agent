"use client";

/**
 * Print-only calendar render (인쇄 기능).
 *
 * Renders the chosen month range (`from`..`to`, inclusive) as static month
 * grids — no scroll, no drag/resize/click handlers — reusing the SAME global
 * calendar classes (.month-sec / .cal-week / .cal-cell / .cal-bar / .mk) and
 * the same pure layout functions as the live view, so the printout matches the
 * on-screen design exactly. All overlapping bars are expanded into lanes (no
 * "+N" collapse): a printout should hide nothing.
 *
 * It is `display:none` on screen and only shown under `@media print` (see
 * globals.css), where each month breaks onto its own A4-landscape page.
 */
import {
  buildWeeksRange,
  groupWeeksByMonth,
  monthLabel,
  WEEKDAYS,
  type YearMonth,
} from "@/lib/calendar/infinite";
import { weekSegments } from "@/lib/calendar/segments";
import { layoutWeek } from "@/lib/calendar/layout";
import { groupMarkersByDate } from "@/lib/calendar/markers";
import { hasNote, tasksWithNotesInRange } from "@/lib/calendar/notes";
import { formatRangeLabel } from "@/lib/calendar/selection";
import { barColors } from "@/lib/color/compose";
import type { Marker, Project, Task, TaskType } from "@/lib/types";

// Same bar geometry as CalendarView so the printout looks identical.
const HEAD_H = 36;
const BAR_H = 22;
const BAR_GAP = 5;
const ROW_MIN = 116;

interface PrintCalendarProps {
  /** Inclusive month range to print (1-based YearMonth). */
  from: YearMonth;
  to: YearMonth;
  /** Same filtered data the live calendar shows (WYSIWYG). */
  tasks: Task[];
  markers: Marker[];
  projectsById: Map<string, Project>;
  taskTypesById: Map<string, TaskType>;
}

export function PrintCalendar({
  from,
  to,
  tasks,
  markers,
  projectsById,
  taskTypesById,
}: PrintCalendarProps) {
  const groups = groupWeeksByMonth(buildWeeksRange(from, to));
  const markersByDate = groupMarkersByDate(markers);

  // The printed date span (first day shown .. last day shown), used to gather
  // the notes that belong in the appendix (US-019 AC4: notes in the snapshot).
  const firstWeek = groups[0]?.weeks[0];
  const lastGroupWeeks = groups[groups.length - 1]?.weeks;
  const lastWeek = lastGroupWeeks?.[lastGroupWeeks.length - 1];
  const notedTasks =
    firstWeek && lastWeek
      ? tasksWithNotesInRange(tasks, firstWeek[0].date, lastWeek[6].date)
      : [];

  return (
    <div className="print-cal" aria-hidden>
      {groups.map((g) => (
        <section className="month-sec print-month" key={g.key}>
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
              const layout = layoutWeek(weekSegments(week, tasks));
              const rows = Math.max(1, layout.laneCount);
              const weekMinH = Math.max(
                ROW_MIN,
                HEAD_H + rows * (BAR_H + BAR_GAP) + 6,
              );
              return (
                <div
                  className="cal-week"
                  key={week[0].date}
                  style={{ minHeight: weekMinH }}
                >
                  {week.map((dy) => {
                    const cellMarkers = markersByDate.get(dy.date);
                    return (
                      <div
                        key={dy.date}
                        className={`cal-cell${dy.month !== g.month ? " out" : ""}${
                          dy.isToday ? " today" : ""
                        }`}
                      >
                        <span className="cal-daynum">{dy.day}</span>
                        {cellMarkers?.map((mk) => (
                          <span
                            key={mk.id}
                            className={`mk ${mk.kind === "deadline" ? "mk-dl" : "mk-ev"}`}
                          >
                            {mk.kind === "deadline" ? "⚑" : "◆"} {mk.label}
                          </span>
                        ))}
                      </div>
                    );
                  })}
                  {layout.segments.map((seg) => {
                    const project = projectsById.get(seg.task.projectId);
                    const taskType = taskTypesById.get(seg.task.taskTypeId);
                    const left = (seg.startCol / 7) * 100;
                    const width = ((seg.endCol - seg.startCol + 1) / 7) * 100;
                    const top = HEAD_H + seg.lane * (BAR_H + BAR_GAP);
                    const r = (cont: boolean) => (cont ? "0" : "3px");
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
                          borderRadius: `${r(seg.contL)} ${r(seg.contR)} ${r(
                            seg.contR,
                          )} ${r(seg.contL)}`,
                        }}
                      >
                        {hasNote(seg.task) && !seg.contL && (
                          <span className="cal-bar-note" aria-hidden />
                        )}
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

      {/* Notes appendix (US-019 AC4): the note text of every shown, noted task,
          on its own page so the snapshot carries the note content, not just a dot. */}
      {notedTasks.length > 0 && (
        <section className="print-notes">
          <h2 className="print-notes-head">메모</h2>
          <ul className="print-notes-list">
            {notedTasks.map((t) => (
              <li key={t.id} className="print-note">
                <span className="print-note-meta">
                  {formatRangeLabel(t.startDate, t.endDate)} · {t.title}
                </span>
                <span className="print-note-body">{t.note}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
