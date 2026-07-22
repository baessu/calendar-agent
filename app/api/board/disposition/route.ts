/**
 * POST /api/board/disposition — write a task's disposition back to Notion.
 *
 * Body: { pageId: string, disposition: <one of DISPOSITIONS> | null }.
 * The disposition is validated against the known option set (null clears it)
 * so an arbitrary string can't be written into the Notion select.
 */
import { NextResponse } from "next/server";
import {
  isBoardConfigured,
  updateDisposition,
  BoardNotionError,
} from "@/lib/board/notion";
import { DISPOSITIONS, type Disposition } from "@/lib/board/types";

export const dynamic = "force-dynamic";

const ALLOWED = new Set<string>(DISPOSITIONS.map((d) => d.value));

export async function POST(request: Request) {
  if (!isBoardConfigured()) {
    return NextResponse.json({ error: "board_not_configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as {
    pageId?: unknown;
    disposition?: unknown;
  } | null;

  const pageId = body?.pageId;
  if (typeof pageId !== "string" || pageId.length === 0) {
    return NextResponse.json({ error: "invalid_pageId" }, { status: 400 });
  }

  // null = clear the tag; otherwise it must be a known option.
  const raw = body?.disposition;
  if (raw !== null && (typeof raw !== "string" || !ALLOWED.has(raw))) {
    return NextResponse.json({ error: "invalid_disposition" }, { status: 400 });
  }
  const disposition = raw as Disposition;

  try {
    await updateDisposition(pageId, disposition);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = err instanceof BoardNotionError ? 502 : 500;
    return NextResponse.json({ error: "notion_update_failed" }, { status });
  }
}
