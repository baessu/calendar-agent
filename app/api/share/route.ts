/**
 * Share API — publish / refresh / collaborative-save / revoke / freshness.
 *
 * A share has two capabilities:
 *   - viewToken  → read-only public page  /s/{viewToken}
 *   - editToken  → read-write edit page   /e/{editToken}
 * The snapshot lives at shares/{viewToken}.json; an edit-key pointer
 * (shares/keys/{editToken}.json → { viewToken }) lets an edit token resolve to
 * the snapshot and proves the caller holds the edit capability.
 *
 * POST   { snapshot, viewToken?, editToken? }
 *   - no tokens            → initial publish: mint both, write snapshot + key.
 *   - editToken            → authorized write (owner refresh OR collaborator
 *                            save): resolve → viewToken, overwrite snapshot.
 *   - viewToken only       → legacy adoption: a pre-edit-link share re-published
 *                            by its owner; mint an editToken and protect it.
 *   → { viewToken, editToken, url, publishedAt }
 * DELETE { editToken? | viewToken? }   → revoke (delete snapshot + key).
 * GET    ?token={viewToken}            → { publishedAt } for owner freshness.
 *
 * Writes now REQUIRE the edit capability (except the one-time legacy adoption),
 * so a leaked view link can only read — it can't overwrite or revoke.
 */
import { NextResponse } from "next/server";
import { parseSnapshot } from "@/lib/share/snapshot";
import { isValidToken, newShareToken } from "@/lib/share/token";
import {
  delEditKey,
  delSnapshot,
  fetchSnapshotRaw,
  isBlobConfigured,
  putEditKey,
  putSnapshot,
  resolveEditToken,
} from "@/lib/share/blob";

export const runtime = "nodejs";

/** ~2 MB guard against oversized uploads. */
const MAX_BODY = 2_000_000;

function notConfigured() {
  return NextResponse.json(
    { error: "공유 저장소(Vercel Blob)가 설정되지 않았습니다." },
    { status: 503 },
  );
}

/** A syntactically valid token, or null. */
function asToken(v: unknown): string | null {
  return typeof v === "string" && isValidToken(v) ? v : null;
}

export async function POST(req: Request) {
  if (!isBlobConfigured()) return notConfigured();

  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) {
      return NextResponse.json({ error: "스냅샷이 너무 큽니다." }, { status: 413 });
    }
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }

  const {
    snapshot: rawSnapshot,
    viewToken: rawView,
    editToken: rawEdit,
  } = (body ?? {}) as {
    snapshot?: unknown;
    viewToken?: unknown;
    editToken?: unknown;
  };

  const snapshot = parseSnapshot(rawSnapshot);
  if (!snapshot) {
    return NextResponse.json({ error: "유효하지 않은 스냅샷" }, { status: 400 });
  }

  const editToken = asToken(rawEdit);
  const viewToken = asToken(rawView);

  try {
    // (a) Authorized write — owner refresh or collaborator save. The edit token
    //     is the write capability; resolve it to the snapshot's view token.
    if (editToken) {
      const resolved = await resolveEditToken(editToken);
      if (!resolved) {
        return NextResponse.json(
          { error: "편집 권한이 없거나 만료된 링크예요." },
          { status: 403 },
        );
      }
      if (viewToken && viewToken !== resolved) {
        return NextResponse.json({ error: "토큰이 일치하지 않습니다." }, { status: 400 });
      }
      const { url } = await putSnapshot(resolved, snapshot);
      return NextResponse.json({
        viewToken: resolved,
        editToken,
        url,
        publishedAt: snapshot.publishedAt,
      });
    }

    // (b) Legacy adoption — a share published before edit links existed, now
    //     re-published by its owner from local data. Mint an edit token so the
    //     share is protected going forward. (No worse than today's behavior,
    //     where any view token could already be overwritten.)
    if (viewToken) {
      const minted = newShareToken();
      await putEditKey(minted, viewToken);
      const { url } = await putSnapshot(viewToken, snapshot);
      return NextResponse.json({
        viewToken,
        editToken: minted,
        url,
        publishedAt: snapshot.publishedAt,
      });
    }

    // (c) Initial publish — mint both capabilities.
    const newView = newShareToken();
    const newEdit = newShareToken();
    await putEditKey(newEdit, newView);
    const { url } = await putSnapshot(newView, snapshot);
    return NextResponse.json({
      viewToken: newView,
      editToken: newEdit,
      url,
      publishedAt: snapshot.publishedAt,
    });
  } catch (err) {
    console.error("share publish failed", err);
    return NextResponse.json({ error: "발행에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!isBlobConfigured()) return notConfigured();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }
  const { editToken: rawEdit, viewToken: rawView, token: rawLegacy } =
    (body ?? {}) as { editToken?: unknown; viewToken?: unknown; token?: unknown };

  const editToken = asToken(rawEdit);
  // Accept `viewToken` or the old `token` field for legacy revokes.
  const viewToken = asToken(rawView) ?? asToken(rawLegacy);

  if (!editToken && !viewToken) {
    return NextResponse.json({ error: "유효하지 않은 토큰" }, { status: 400 });
  }

  try {
    if (editToken) {
      const resolved = await resolveEditToken(editToken);
      // If the key is already gone, fall back to the supplied view token.
      const target = resolved ?? viewToken;
      if (target) await delSnapshot(target);
      await delEditKey(editToken);
    } else if (viewToken) {
      // Legacy revoke (no edit token): just remove the snapshot.
      await delSnapshot(viewToken);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("share revoke failed", err);
    return NextResponse.json({ error: "해제에 실패했습니다." }, { status: 500 });
  }
}

/**
 * Owner read-back for a view token. `?token=` returns the current snapshot's
 * publishedAt (freshness — has a collaborator edited since the owner's last
 * sync?); add `&full=1` to also return the snapshot itself (for pulling those
 * edits into local). Public info (the snapshot blob is public), so no
 * capability is required — and routing through the server avoids any CORS
 * uncertainty on the Blob URL.
 */
export async function GET(req: Request) {
  if (!isBlobConfigured()) return notConfigured();
  const url = new URL(req.url);
  const token = asToken(url.searchParams.get("token"));
  if (!token) {
    return NextResponse.json({ error: "유효하지 않은 토큰" }, { status: 400 });
  }
  const snapshot = parseSnapshot(await fetchSnapshotRaw(token).catch(() => null));
  const publishedAt = snapshot?.publishedAt ?? null;
  if (url.searchParams.get("full") === "1") {
    return NextResponse.json({ publishedAt, snapshot: snapshot ?? null });
  }
  return NextResponse.json({ publishedAt });
}
