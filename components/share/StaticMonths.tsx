/**
 * Static, read-only month grids (US-024).
 *
 * The on-screen render for the public share page: the same month grids as the
 * live calendar — identical classes (.month-sec / .cal-week / .cal-cell /
 * .cal-bar / .mk) and the same pure layout functions — but with no scroll
 * virtualization and no drag/resize/click handlers. All overlapping bars are
 * expanded into lanes (no "+N" collapse) so nothing is hidden. The matching
 * print render lives in <PrintCalendar>.
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
import { hasNote } from "@/lib/calendar/notes";
import { barColors } from "@/lib/color/compose";
import type { Marker, Project, Task, TaskType } from "@/lib/types";

// Same bar geometry as the live CalendarView / PrintCalendar.
const HEAD_H = 36;
const BAR_H = 22;
const BAR_GAP = 5;
const ROW_MIN = 116;

interface StaticMonthsProps {
  from: YearMonth;
  to: YearMonth;
  tasks: Task[];
  markers: Marker[];
  projectsById: Map<string, Project>;
  taskTypesById: Map<string, TaskType>;
}

export function StaticMonths({
  from,
  to,
  tasks,
  markers,
  projectsById,
  taskTypesById,
}: StaticMonthsProps) {
  const groups = groupWeeksByMonth(buildWeeksRange(from, to));
  const markersByDate = groupMarkersByDate(markers);

  return (
    <>
      {groups.map((g) => (
        <section className="month-sec" key={g.key}>
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
    </>
  );
}
