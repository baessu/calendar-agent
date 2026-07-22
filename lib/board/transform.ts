/**
 * Pure transforms for the task board — no I/O, no "server-only".
 *
 * Everything here maps and shapes already-fetched Notion data: reading typed
 * values out of Notion's property envelopes, turning a page into a BoardTask,
 * and grouping/sorting tasks for display. Kept apart from notion.ts (which does
 * the network I/O) so this logic is unit-testable in jsdom — the same split as
 * lib/share/snapshot.ts (pure) vs lib/share/blob.ts (I/O).
 */
import {
  CLOSED_STATUSES,
  UNGROUPED,
  type BoardGroup,
  type BoardTask,
  type Disposition,
  type TaskStatus,
} from "./types";

/** A minimal Notion page shape — only what the board reads. */
export interface NotionPage {
  id: string;
  url?: string;
  properties: Record<string, unknown>;
}

type Props = Record<string, unknown>;

/* ── Notion property readers ─────────────────────────────────────────────
 * Notion wraps every value in a typed envelope; these pull the one field we
 * need and tolerate nulls, so a task missing a property renders rather than
 * throws. `unknown` in, narrowed out — the API shape is not ours to trust. */

export function selectName(props: Props, key: string): string | null {
  const p = props[key] as { select?: { name?: string } } | undefined;
  return p?.select?.name ?? null;
}

export function statusName(props: Props, key: string): string | null {
  const p = props[key] as { status?: { name?: string } } | undefined;
  return p?.status?.name ?? null;
}

export function titleText(props: Props, key: string): string {
  const p = props[key] as { title?: { plain_text?: string }[] } | undefined;
  return (p?.title ?? []).map((t) => t.plain_text ?? "").join("").trim();
}

export function dateStart(props: Props, key: string): string | null {
  const p = props[key] as { date?: { start?: string } } | undefined;
  const start = p?.date?.start;
  // Keep the date part only ("YYYY-MM-DD"); Notion may append a time.
  return start ? start.slice(0, 10) : null;
}

export function numberVal(props: Props, key: string): number | null {
  const p = props[key] as { number?: number | null } | undefined;
  return typeof p?.number === "number" ? p.number : null;
}

/** Map one Notion page to a BoardTask, or null if it has no title. */
export function toTask(page: NotionPage): BoardTask | null {
  const title = titleText(page.properties, "Task");
  if (!title) return null; // an untitled row is noise, not a task
  const hours = numberVal(page.properties, "예상 소요시간");
  return {
    id: page.id,
    title,
    project: selectName(page.properties, "Project"),
    disposition: selectName(page.properties, "액션 태그") as Disposition,
    status: statusName(page.properties, "Status") as TaskStatus,
    due: dateStart(page.properties, "Due Date"),
    estMinutes: hours != null ? Math.round(hours * 60) : null,
    delegate: selectName(page.properties, "위임 대상"),
    url: page.url ?? "",
  };
}

/** Whether a task counts as active (not Done/Cancelled). */
export function isActive(task: BoardTask): boolean {
  return !CLOSED_STATUSES.has(task.status ?? "");
}

/** Map + filter a page list to active BoardTasks. */
export function activeTasksFromPages(pages: NotionPage[]): BoardTask[] {
  const out: BoardTask[] = [];
  for (const page of pages) {
    const task = toTask(page);
    if (task && isActive(task)) out.push(task);
  }
  return out;
}

/**
 * Within a group: urgent first (🔴 → 📅 → other → untriaged), then by due date
 * (undated last), then title. Stable and total, so the render order is
 * deterministic across refreshes.
 */
export function sortTasks(tasks: BoardTask[]): BoardTask[] {
  const rank = (d: Disposition) =>
    d?.startsWith("🔴") ? 0 : d === "📅 일정잡으세요" ? 1 : d ? 2 : 3;
  return [...tasks].sort((a, b) => {
    const r = rank(a.disposition) - rank(b.disposition);
    if (r !== 0) return r;
    if (a.due && b.due && a.due !== b.due) return a.due.localeCompare(b.due);
    if (a.due && !b.due) return -1;
    if (!a.due && b.due) return 1;
    return a.title.localeCompare(b.title);
  });
}

/** Group tasks by Project (ungrouped under "미분류"), largest group first. */
export function groupByProject(tasks: BoardTask[]): BoardGroup[] {
  const byProject = new Map<string, BoardTask[]>();
  for (const t of tasks) {
    const key = t.project ?? UNGROUPED;
    const list = byProject.get(key);
    if (list) list.push(t);
    else byProject.set(key, [t]);
  }
  return [...byProject.entries()]
    .map(([project, ts]) => ({ project, tasks: sortTasks(ts) }))
    .sort((a, b) => {
      // "미분류" always sinks to the bottom; otherwise larger groups lead.
      if (a.project === UNGROUPED) return 1;
      if (b.project === UNGROUPED) return -1;
      return b.tasks.length - a.tasks.length;
    });
}
