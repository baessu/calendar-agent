"use client";

/**
 * Project share popover (US-025).
 *
 * Publishes a project's calendar as a read-only snapshot and manages the link:
 * publish + copy, refresh (re-publish to the same token), and revoke (delete,
 * with a two-step confirm). Share state is shown (published date + live link).
 * Pure UI — all storage/API work is done by the parent's handlers; this only
 * owns the copied / confirm interaction state. Swiss editorial: hairlines, no
 * shadow, ESC / ✕ / backdrop close, shares the .cp-* / .create-pop styling.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Project, ShareRecord } from "@/lib/types";

interface SharePopoverProps {
  project: Project;
  /** Current local share record, or null when not yet shared. */
  share: ShareRecord | null;
  /** Full public link (origin + /s/{token}) when shared. */
  shareUrl: string | null;
  x: number;
  y: number;
  /** A publish/refresh/revoke request is in flight. */
  busy: boolean;
  error: string | null;
  /** Publish (first time) or refresh (re-publish to the same token). */
  onPublish: () => void;
  onRevoke: () => void;
  onClose: () => void;
}

const MARGIN = 12;

export function SharePopover({
  project,
  share,
  shareUrl,
  x,
  y,
  busy,
  error,
  onPublish,
  onRevoke,
  onClose,
}: SharePopoverProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [copied, setCopied] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = Math.max(MARGIN, Math.min(x, window.innerWidth - width - MARGIN));
    const top = Math.max(MARGIN, Math.min(y, window.innerHeight - height - MARGIN));
    setPos({ left, top });
  }, [x, y, share]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard?.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard may be blocked; the link stays visible to copy manually */
    }
  }

  const publishedLabel = share
    ? new Date(share.updatedAt).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="cp-backdrop" onPointerDown={onClose}>
      <div
        ref={cardRef}
        className="create-pop share-pop"
        style={{ left: pos.left, top: pos.top }}
        role="dialog"
        aria-label="프로젝트 공유"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="cp-head">
          <span className="cp-title">{project.name} 공유</span>
          <button type="button" className="cp-x" aria-label="닫기" onClick={onClose}>
            ✕
          </button>
        </div>

        {!share ? (
          <>
            <p className="pp-note share-note">
              이 프로젝트의 일정·메모를 읽기 전용 링크로 공유해요. 보는 사람은
              편집할 수 없고, 인쇄만 할 수 있어요.
            </p>
            {error && <p className="cp-err">{error}</p>}
            <div className="cp-foot">
              <span />
              <button
                type="button"
                className="cp-save"
                disabled={busy}
                onClick={onPublish}
              >
                {busy ? "발행 중…" : "공유 시작"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="share-linkrow">
              <input
                className="cp-input share-link"
                type="text"
                readOnly
                value={shareUrl ?? ""}
                aria-label="공유 링크"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                className="share-copy"
                onClick={copy}
                disabled={!shareUrl}
              >
                {copied ? "복사됨" : "복사"}
              </button>
            </div>
            {publishedLabel && (
              <p className="share-meta">마지막 발행 · {publishedLabel}</p>
            )}
            {error && <p className="cp-err">{error}</p>}
            <div className="cp-foot share-foot">
              {confirmingRevoke ? (
                <span className="cp-confirm" role="alert">
                  <span className="cp-confirm-q">공유를 해제할까요?</span>
                  <button
                    type="button"
                    className="cp-confirm-yes"
                    disabled={busy}
                    onClick={onRevoke}
                  >
                    {busy ? "해제 중…" : "해제"}
                  </button>
                  <button
                    type="button"
                    className="cp-confirm-no"
                    onClick={() => setConfirmingRevoke(false)}
                  >
                    취소
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="cp-del"
                  disabled={busy}
                  onClick={() => setConfirmingRevoke(true)}
                >
                  공유 해제
                </button>
              )}
              <button
                type="button"
                className="cp-save"
                disabled={busy}
                onClick={onPublish}
                title="현재 상태로 다시 발행"
              >
                {busy ? "갱신 중…" : "갱신"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
