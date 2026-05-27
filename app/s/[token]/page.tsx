/**
 * Public read-only share page (US-024): /s/{token}.
 *
 * SSR fetches the token's snapshot from Blob (server-side; the viewer never
 * gets Blob credentials and the page never touches IndexedDB), then renders a
 * read-only calendar. Missing / revoked / malformed tokens fall back to a
 * friendly "not found" page. Always dynamic so a refreshed snapshot shows.
 */
import { cache } from "react";
import type { Metadata } from "next";
import { ShareNotFound } from "@/components/share/ShareNotFound";
import { SharedCalendar } from "@/components/share/SharedCalendar";
import { fetchSnapshotRaw, isBlobConfigured } from "@/lib/share/blob";
import { parseSnapshot, type ShareSnapshot } from "@/lib/share/snapshot";
import { isValidToken } from "@/lib/share/token";

export const dynamic = "force-dynamic";

/** Load + validate a token's snapshot, memoized per request (metadata + page). */
const loadSnapshot = cache(
  async (token: string): Promise<ShareSnapshot | null> => {
    if (!isValidToken(token) || !isBlobConfigured()) return null;
    const raw = await fetchSnapshotRaw(token).catch(() => null);
    return parseSnapshot(raw);
  },
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const snapshot = await loadSnapshot(token);
  return {
    title: snapshot ? `${snapshot.project.name} · 공유 캘린더` : "공유 캘린더",
    robots: { index: false, follow: false },
  };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const snapshot = await loadSnapshot(token);
  if (!snapshot) return <ShareNotFound />;
  return <SharedCalendar snapshot={snapshot} />;
}
