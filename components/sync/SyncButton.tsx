"use client";

/**
 * Top-bar account sync control.
 *
 * Signed out: a 로그인 link. Signed in: a button showing sync state, which
 * syncs on click and automatically — on mount, and after local edits settle.
 *
 * The automatic sync is debounced rather than fired per edit: dragging a task
 * bar produces a burst of writes, and syncing each one would upload the whole
 * state dozens of times for a single gesture. Trailing-edge only, so the sync
 * carries the finished result instead of an intermediate frame.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { SyncError, runSync } from "@/lib/sync/client";

/** Quiet period after the last local edit before an automatic sync fires. */
const DEBOUNCE_MS = 2500;

type Status =
  | { kind: "idle"; at: number | null }
  | { kind: "syncing" }
  | { kind: "error"; message: string };

interface SyncButtonProps {
  /**
   * An opaque fingerprint of local data, supplied by the parent. Any change
   * schedules a debounced sync; the value itself carries no meaning.
   */
  revision: string;
  /**
   * Called after a sync changed the local store, so the parent can reload its
   * React state. Sync writes straight to Dexie, which the parent's in-memory
   * copy would otherwise not see until a reload.
   */
  onSynced: () => void;
}

export function SyncButton({ revision, onSynced }: SyncButtonProps) {
  const { data: session, status: authStatus } = useSession();
  const [status, setStatus] = useState<Status>({ kind: "idle", at: null });
  // Guards against overlapping syncs: a click landing mid-sync, or the
  // debounce firing while a manual sync is still in flight.
  const inFlight = useRef(false);
  // Whether this session has completed its first sync. The first one runs
  // immediately — a device that just signed in needs the pull now, not after
  // a debounce it may never reach if the user makes no edits.
  const primed = useRef(false);

  // Keep the callback in a ref so the sync effect doesn't re-fire (and restart
  // its debounce) every time the parent re-renders with a new closure.
  const onSyncedRef = useRef(onSynced);
  useEffect(() => {
    onSyncedRef.current = onSynced;
  }, [onSynced]);

  const sync = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setStatus({ kind: "syncing" });
    try {
      const result = await runSync();
      primed.current = true;
      setStatus({ kind: "idle", at: result.syncedAt });
      onSyncedRef.current();
    } catch (err) {
      setStatus({ kind: "error", message: describe(err) });
    } finally {
      inFlight.current = false;
    }
  }, []);

  // Sync on sign-in, then whenever local data settles.
  useEffect(() => {
    if (authStatus !== "authenticated") return;
    const t = setTimeout(sync, primed.current ? DEBOUNCE_MS : 0);
    return () => clearTimeout(t);
  }, [authStatus, revision, sync]);

  if (authStatus === "loading") return null;

  if (authStatus !== "authenticated") {
    return (
      <a href="/login" className="ed-today ed-sync">
        로그인
      </a>
    );
  }

  return (
    <button
      type="button"
      className={`ed-today ed-sync${status.kind === "error" ? " err" : ""}`}
      onClick={sync}
      disabled={status.kind === "syncing"}
      title={session?.user?.email ?? undefined}
    >
      {label(status)}
    </button>
  );
}

function label(status: Status): string {
  switch (status.kind) {
    case "syncing":
      return "동기화 중…";
    case "error":
      return status.message;
    case "idle":
      return status.at ? `동기화됨 ${clock(status.at)}` : "동기화";
  }
}

/** "HH:MM" in the viewer's locale — enough to answer "is this current?". */
function clock(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Turn a thrown value into something the top bar can show a user. */
function describe(err: unknown): string {
  if (err instanceof SyncError) {
    if (err.status === 401) return "로그인 필요";
    if (err.status === 503) return "동기화 미설정";
  }
  return "동기화 실패";
}
