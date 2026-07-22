/**
 * Task board domain types.
 *
 * The board is a live view over the Notion "🐸 TASK DB" (not calendar-agent's
 * local Dexie store): tasks are grouped by their Notion `Project` and colored
 * by their `액션 태그` (action tag), which the board treats as the changeable
 * "disposition". A change writes straight back to Notion — Notion is the single
 * source of truth, unlike the original cockpit which kept dispositions local.
 *
 * These types are the wire shape between the server route and the client; they
 * are intentionally flat and JSON-serializable (Notion's nested property shape
 * is flattened server-side in lib/board/notion.ts).
 */

/**
 * The triage disposition — the board's editable axis, read verbatim from the
 * TASK DB `액션 태그` select. `null` is an untriaged task (no action tag).
 *
 * Typed as `string | null` rather than a fixed union because a Notion select
 * can hold any option a human adds in Notion, and the board must render it
 * rather than crash. Writes are restricted to the known set (DISPOSITIONS)
 * at the API boundary, so the loose read type costs no write safety.
 */
export type Disposition = string | null;

/** The dispositions the board offers in its change menu, in triage order. */
export const DISPOSITIONS: { value: string; label: string }[] = [
  { value: "🔴 당장하세요 (중요+긴급)", label: "지금 (중요+긴급)" },
  { value: "🔴 당장하세요", label: "지금" },
  { value: "📅 일정잡으세요", label: "일정 잡기" },
  { value: "👋 위임하세요", label: "위임" },
  { value: "🗑️ 제거하세요", label: "제거" },
];

/** Notion `Status` values, kept for a secondary badge and open/closed filter. */
export type TaskStatus =
  | "Not started"
  | "In progress"
  | "Blocked"
  | "Delayed"
  | "Done"
  | "Cancelled"
  | null;

/** Statuses treated as "closed" — filtered out of the board. */
export const CLOSED_STATUSES: ReadonlySet<string> = new Set([
  "Done",
  "Cancelled",
]);

/** A single task as the board renders it (flattened from a Notion page). */
export interface BoardTask {
  /** Notion page id — the write-back target. */
  id: string;
  title: string;
  /** Notion `Project` select, or null → grouped under "미분류". */
  project: string | null;
  disposition: Disposition;
  status: TaskStatus;
  /** Due date "YYYY-MM-DD", or null. */
  due: string | null;
  /** Estimated minutes, or null (Notion stores hours; we normalize to minutes). */
  estMinutes: number | null;
  /** Delegate target (위임 대상), e.g. "🤖 봇", or null. */
  delegate: string | null;
  /** Public Notion URL, so a card can deep-link to the source. */
  url: string;
}

/** Tasks grouped under one project heading. */
export interface BoardGroup {
  /** Project name, or "미분류" for tasks with no Project. */
  project: string;
  tasks: BoardTask[];
}

/** The whole board payload returned by GET /api/board. */
export interface BoardData {
  groups: BoardGroup[];
  /** When the server fetched from Notion (epoch ms), for a freshness label. */
  fetchedAt: number;
  /** Total active task count across groups. */
  total: number;
}

/** Bucket name for tasks with no Project set. */
export const UNGROUPED = "미분류";
