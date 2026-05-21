"use client";

/**
 * Infinite-scroll monthly calendar (US-003).
 *
 * Renders a continuous run of months (no paging). The visible month range grows
 * lazily as the user scrolls toward either edge; prepended months are added with
 * scroll anchoring so the viewport never jumps. The top title tracks the month
 * currently pinned under the sticky header, and "오늘" returns to today.
 *
 * No bars/markers here yet — those land in US-005 / US-017. The grid is the
 * line-less minimal Swiss layout from the F-tab mockup.
 */
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  addMonths,
  buildWeeksRange,
  groupWeeksByMonth,
  monthLabel,
  WEEKDAYS,
  type YearMonth,
} from "@/lib/calendar/infinite";
import { todayDateString } from "@/lib/calendar/dates";

// Months shown on either side of today at first paint.
const INITIAL_BACK = 3;
const INITIAL_FWD = 3;
// Distance (px) from a scroll edge that triggers growing the range by one month.
const EXPAND_PX = 600;

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

      <div className="ed-calwrap" ref={scrollRef} onScroll={onScroll}>
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
              {g.weeks.map((week) => (
                <div className="cal-week" key={week[0].date}>
                  {week.map((dy) => (
                    <div
                      key={dy.date}
                      className={`cal-cell${dy.month !== g.month ? " out" : ""}${
                        dy.isToday ? " today" : ""
                      }`}
                      data-today={dy.isToday ? "true" : undefined}
                    >
                      <span className="cal-daynum">{dy.day}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
