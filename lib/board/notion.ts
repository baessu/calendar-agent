/**
 * Server-only Notion I/O for the task board.
 *
 * Isolates every Notion REST call so the rest of the app stays storage-
 * agnostic (mirrors how lib/share/blob.ts isolates Vercel Blob). Uses plain
 * fetch against the Notion API rather than the SDK — one dependency fewer, and
 * we touch only two endpoints (query + page update). All mapping/grouping is
 * delegated to the pure, tested lib/board/transform.ts.
 *
 * The token (NOTION_TOKEN) never leaves the server; the browser talks to
 * /api/board, which calls in here. Requires NOTION_TOKEN + NOTION_DATABASE_ID.
 */
import "server-only";
import type { BoardData, Disposition } from "./types";
import {
  activeTasksFromPages,
  groupByProject,
  type NotionPage,
} from "./transform";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

/** Whether the Notion board integration is wired up. */
export function isBoardConfigured(): boolean {
  return Boolean(process.env.NOTION_TOKEN && process.env.NOTION_DATABASE_ID);
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

/** Fetch every task page, following Notion's pagination. Filtering to active
 *  tasks + mapping happens in the pure transform layer. */
async function fetchPages(): Promise<NotionPage[]> {
  const dbId = process.env.NOTION_DATABASE_ID;
  const pages: NotionPage[] = [];
  let cursor: string | undefined;

  do {
    const res = await fetch(`${NOTION_API}/databases/${dbId}/query`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new BoardNotionError(
        `Notion query failed (${res.status})`,
        res.status,
        detail,
      );
    }
    const data = (await res.json()) as {
      results?: NotionPage[];
      has_more?: boolean;
      next_cursor?: string | null;
    };
    pages.push(...(data.results ?? []));
    cursor = data.has_more ? data.next_cursor ?? undefined : undefined;
  } while (cursor);

  return pages;
}

/** Build the full board payload. `now` injectable for deterministic tests. */
export async function getBoard(now: number = Date.now()): Promise<BoardData> {
  const tasks = activeTasksFromPages(await fetchPages());
  return { groups: groupByProject(tasks), fetchedAt: now, total: tasks.length };
}

/**
 * Write a task's disposition back to Notion (`액션 태그`). Passing null clears
 * the tag (untriaged). Throws BoardNotionError on failure so the route can
 * surface it and the client can roll back its optimistic update.
 */
export async function updateDisposition(
  pageId: string,
  disposition: Disposition,
): Promise<void> {
  const res = await fetch(`${NOTION_API}/pages/${pageId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({
      properties: {
        "액션 태그": {
          select: disposition ? { name: disposition } : null,
        },
      },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new BoardNotionError(
      `Notion update failed (${res.status})`,
      res.status,
      detail,
    );
  }
}

/** A Notion API failure, carrying the HTTP status for the route to relay. */
export class BoardNotionError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail: string = "",
  ) {
    super(message);
    this.name = "BoardNotionError";
  }
}
