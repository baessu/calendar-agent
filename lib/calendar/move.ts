/**
 * Bar drag-move math (pure logic, unit-tested) — US-010.
 *
 * Dragging a task bar shifts its whole span by the number of days between the
 * date the user grabbed and the date they dropped on, so the duration (number of
 * inclusive days) is preserved and week boundaries are irrelevant — it is plain
 * date arithmetic. All math goes through the UTC-noon parser so there is no
 * timezone drift, matching the rest of the calendar.
 */
import type { DateString } from "@/lib/types";
import { addDays, diffDays, parseDate, toDateString } from "./dates";
import type { DateRange } from "./selection";

/** Shift [start..end] by `deltaDays` whole days (negative moves earlier). */
export function shiftRange(
  start: DateString,
  end: DateString,
  deltaDays: number,
): DateRange {
  return {
    start: toDateString(addDays(parseDate(start), deltaDays)),
    end: toDateString(addDays(parseDate(end), deltaDays)),
  };
}

/**
 * Move a task so the date it was grabbed on lands on the date it was dropped on,
 * keeping the same duration. `grabDate === dropDate` returns the original range.
 */
export function moveTaskByDrag(
  start: DateString,
  end: DateString,
  grabDate: DateString,
  dropDate: DateString,
): DateRange {
  const delta = diffDays(parseDate(grabDate), parseDate(dropDate));
  return shiftRange(start, end, delta);
}
