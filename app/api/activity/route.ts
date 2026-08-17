/**
 * Activity API — cross-device agent feed collection (AI Teams 메신저).
 *
 * Each machine owns one blob at activity/{device}.json holding its recent
 * events + summaries, so concurrent devices never race on the same object
 * (no read-modify-write). GET merges every device blob for the web viewer.
 *
 * POST  { device, events[], summaries?, esum?, tasks? }  — header
 *        `x-activity-token: $ACTIVITY_TOKEN` (shared secret, machine-local).
 * GET    → { events[], summaries, esum, tasks, devices[] } — session-gated
 *        like /cockpit, since prompts and reports are sensitive.
 */
import { NextResponse } from "next/server";
import { del, list, put } from "@vercel/blob";
import { auth } from "@/auth";

export const runtime = "nodejs";

const MAX_BODY = 3_000_000; // ~3 MB per device payload
const MAX_EVENTS = 800; // keep the newest N per device
const PREFIX = "activity/";

type Payload = {
  device?: string;
  events?: unknown[];
  summaries?: Record<string, string>;
  esum?: Record<string, string>;
  tasks?: Record<string, unknown>;
};

const safeDevice = (d: string) => d.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);

export async function POST(req: Request) {
  const token = process.env.ACTIVITY_TOKEN;
  if (!token) return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (req.headers.get("x-activity-token") !== token)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const raw = await req.text();
  if (raw.length > MAX_BODY)
    return NextResponse.json({ error: "payload too large" }, { status: 413 });

  let body: Payload;
  try {
    body = JSON.parse(raw) as Payload;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const device = safeDevice(String(body.device || ""));
  if (!device) return NextResponse.json({ error: "device required" }, { status: 400 });

  const events = Array.isArray(body.events) ? body.events.slice(-MAX_EVENTS) : [];
  const doc = {
    device,
    updatedAt: new Date().toISOString(),
    events,
    summaries: body.summaries || {},
    esum: body.esum || {},
    tasks: body.tasks || {},
  };

  await put(`${PREFIX}${device}.json`, JSON.stringify(doc), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });

  return NextResponse.json({ ok: true, device, events: events.length });
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.BLOB_READ_WRITE_TOKEN)
    return NextResponse.json({ error: "not configured" }, { status: 503 });

  const { blobs } = await list({ prefix: PREFIX, limit: 20 });
  const docs = await Promise.all(
    blobs
      .filter((b) => b.pathname.endsWith(".json"))
      .map(async (b) => {
        try {
          const r = await fetch(b.url, { cache: "no-store" });
          return (await r.json()) as Awaited<ReturnType<typeof JSON.parse>>;
        } catch {
          return null;
        }
      }),
  );

  const events: Record<string, unknown>[] = [];
  const summaries: Record<string, string> = {};
  const esum: Record<string, string> = {};
  const tasks: Record<string, unknown> = {};
  const devices: { device: string; updatedAt: string; events: number }[] = [];

  for (const d of docs) {
    if (!d) continue;
    devices.push({ device: d.device, updatedAt: d.updatedAt, events: d.events?.length ?? 0 });
    for (const e of d.events ?? []) events.push(e);
    Object.assign(summaries, d.summaries ?? {});
    Object.assign(esum, d.esum ?? {});
    Object.assign(tasks, d.tasks ?? {});
  }
  events.sort((a, b) => Number(a.ts ?? 0) - Number(b.ts ?? 0));

  return NextResponse.json(
    { events, summaries, esum, tasks, devices },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Clear one device's feed (housekeeping): DELETE ?device=xxx with the token. */
export async function DELETE(req: Request) {
  const token = process.env.ACTIVITY_TOKEN;
  if (!token || req.headers.get("x-activity-token") !== token)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const device = safeDevice(new URL(req.url).searchParams.get("device") || "");
  if (!device) return NextResponse.json({ error: "device required" }, { status: 400 });
  const path = `${PREFIX}${device}.json`;
  const { blobs } = await list({ prefix: path, limit: 1 });
  const hit = blobs.find((b) => b.pathname === path);
  if (hit) await del(hit.url);
  return NextResponse.json({ ok: true, deleted: Boolean(hit) });
}
