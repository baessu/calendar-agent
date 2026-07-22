/**
 * GET /api/board — the live task board, read from the Notion TASK DB.
 *
 * Server-side so NOTION_TOKEN never reaches the browser. Returns 503 when the
 * integration isn't configured (missing token/db id) so the page can show a
 * setup hint instead of a stack trace.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBoard, isBoardConfigured, BoardNotionError } from "@/lib/board/notion";

// Always run fresh — the board reflects Notion's current state, never a cache.
export const dynamic = "force-dynamic";

export async function GET() {
  // The board is sensitive real task data on a public site — gate it. Without
  // this, anyone could read the whole TASK DB via a fixed URL.
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isBoardConfigured()) {
    return NextResponse.json({ error: "board_not_configured" }, { status: 503 });
  }
  try {
    const board = await getBoard();
    return NextResponse.json(board);
  } catch (err) {
    const status = err instanceof BoardNotionError ? 502 : 500;
    return NextResponse.json({ error: "notion_fetch_failed" }, { status });
  }
}
