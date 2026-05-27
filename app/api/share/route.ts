/**
 * Share publish / refresh / revoke API (US-023).
 *
 * POST   { token?, snapshot }  → publish or refresh; returns { token, url }.
 *                                A token is reused (refresh) or minted (publish).
 * DELETE { token }             → revoke; deletes the snapshot blob.
 *
 * The client builds the snapshot from its local IndexedDB (local-first) and
 * sends it here; this route only writes/removes the Blob. No local data ever
 * touches the server beyond the snapshot the user chose to publish.
 */
import { NextResponse } from "next/server";
import { parseSnapshot } from "@/lib/share/snapshot";
import { isValidToken, newShareToken } from "@/lib/share/token";
import { delSnapshot, isBlobConfigured, putSnapshot } from "@/lib/share/blob";

export const runtime = "nodejs";

/** ~2 MB guard against oversized uploads. */
const MAX_BODY = 2_000_000;

function notConfigured() {
  return NextResponse.json(
    { error: "공유 저장소(Vercel Blob)가 설정되지 않았습니다." },
    { status: 503 },
  );
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

  const { token: rawToken, snapshot: rawSnapshot } = (body ?? {}) as {
    token?: unknown;
    snapshot?: unknown;
  };

  const snapshot = parseSnapshot(rawSnapshot);
  if (!snapshot) {
    return NextResponse.json({ error: "유효하지 않은 스냅샷" }, { status: 400 });
  }

  const token =
    typeof rawToken === "string" && isValidToken(rawToken)
      ? rawToken
      : newShareToken();

  try {
    const { url } = await putSnapshot(token, snapshot);
    return NextResponse.json({ token, url });
  } catch (err) {
    console.error("share publish failed", err);
    return NextResponse.json({ error: "발행에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!isBlobConfigured()) return notConfigured();

  let token: unknown;
  try {
    ({ token } = (await req.json()) as { token?: unknown });
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 });
  }

  if (typeof token !== "string" || !isValidToken(token)) {
    return NextResponse.json({ error: "유효하지 않은 토큰" }, { status: 400 });
  }

  try {
    await delSnapshot(token);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("share revoke failed", err);
    return NextResponse.json({ error: "해제에 실패했습니다." }, { status: 500 });
  }
}
