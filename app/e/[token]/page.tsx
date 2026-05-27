/**
 * Collaborative edit share page: /e/{editToken}.
 *
 * SSR resolves the edit token to its snapshot (edit-key pointer → view token →
 * snapshot blob; all server-side, the viewer never gets Blob credentials), then
 * hands it to a client editor that saves changes back to the same Blob. Missing
 * / revoked / malformed edit tokens fall back to "not found". Always dynamic so
 * a collaborator opening the link sees the latest published state.
 */
import { cache } from "react";
import type { Metadata } from "next";
import { ShareNotFound } from "@/components/share/ShareNotFound";
import { EditableSharedCalendar } from "@/components/share/EditableSharedCalendar";
import {
  fetchSnapshotRaw,
  isBlobConfigured,
  resolveEditToken,
} from "@/lib/share/blob";
import { parseSnapshot, type ShareSnapshot } from "@/lib/share/snapshot";
import { isValidToken } from "@/lib/share/token";

export const dynamic = "force-dynamic";

/** Resolve an edit token to its snapshot, memoized per request (metadata + page). */
const loadForEdit = cache(
  async (editToken: string): Promise<ShareSnapshot | null> => {
    if (!isValidToken(editToken) || !isBlobConfigured()) return null;
    const viewToken = await resolveEditToken(editToken).catch(() => null);
    if (!viewToken) return null;
    const raw = await fetchSnapshotRaw(viewToken).catch(() => null);
    return parseSnapshot(raw);
  },
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const snapshot = await loadForEdit(token);
  return {
    title: snapshot ? `${snapshot.project.name} · 편집` : "공유 캘린더 편집",
    robots: { index: false, follow: false },
  };
}

export default async function EditSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const snapshot = await loadForEdit(token);
  if (!snapshot) return <ShareNotFound />;
  return <EditableSharedCalendar snapshot={snapshot} editToken={token} />;
}
