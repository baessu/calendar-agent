/**
 * Shared domain types for the monthly calendar.
 *
 * Dates are stored as "YYYY-MM-DD" strings (no timezone) and compared via
 * local-midnight utils elsewhere. Timestamps are epoch milliseconds.
 */

/** A calendar date as "YYYY-MM-DD" (no time, no timezone). */
export type DateString = string;

/** Epoch milliseconds (Date.now()). */
export type Timestamp = number;

/** Tone direction applied to a project color to build a task-type shade. */
export type ToneMode = "dark" | "tint";

/** Point-date marker kind (rendered as a monochrome chip, not a colored bar). */
export type MarkerKind = "event" | "deadline";

/** A project — identity color is one of the same-tone 8 hues (S58 L46). */
export interface Project {
  id: string;
  name: string;
  /** HEX from PROJECT_COLORS (e.g. "#3175B9"). */
  color: string;
  visible: boolean;
  order: number;
  createdAt: Timestamp;
}

/** A globally shared task type — defines the tone applied over a project color. */
export interface TaskType {
  id: string;
  name: string;
  mode: ToneMode;
  /** Tone strength 0..1 (dark = darken, tint = mix toward white). */
  k: number;
  order: number;
  createdAt: Timestamp;
}

/** A dated task — spans startDate..endDate inclusive, rendered as a bar. */
export interface Task {
  id: string;
  projectId: string;
  taskTypeId: string;
  title: string;
  startDate: DateString;
  endDate: DateString;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** A point-date marker (event / hard deadline). */
export interface Marker {
  id: string;
  kind: MarkerKind;
  label: string;
  date: DateString;
  /** Optional owning project. */
  projectId?: string;
  createdAt: Timestamp;
}
