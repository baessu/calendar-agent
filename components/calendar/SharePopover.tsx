"use client";

/**
 * Project share popover (US-025 + edit links).
 *
 * Publishes a project's calendar and manages two capability links: a read-only
 * 보기 링크 (/s/{token}) anyone can open, and an 편집 링크 (/e/{editToken}) that
 * lets the holder edit. The owner copies whichever fits each recipient.
 * Refresh re-publishes the owner's local copy (overwriting collaborator edits),
 * 가져오기 pulls a collaborator's edits back into local, and revoke deletes the
 * snapshot (two-step confirm). Pure UI — all storage/API work is the parent's;
 * this owns only the per-link copied state and the confirm/interaction state.
 * Swiss editorial: hairlines, no shadow, ESC / ✕ / backdrop close.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Project, ShareRecord } from "@/lib/types";

interface SharePopoverProps {
  project: Project;
  /** Current local share record, or null when not yet shared. */
  share: ShareRecord | null;
  /** Read-only link (origin + /s/{token}) when shared. */
  shareUrl: string | null;
  /** Edit link (origin + /e/{editToken}) when shared and an edit token exists. */
  editShareUrl: string | null;
  /** A collaborator has edited since the owner's last publish/pull. */
  stale: boolean;
  x: number;
  y: number;
  /** A publish/refresh/revoke/pull request is in flight. */
  busy: boolean;
  error: string | null;
  /** Publish (first time) or refresh (re-publish to the same tokens). */
  onPublish: () => void;
  /** Pull a collaborator's edits into the local store. */
  onPull: () => void;
  onRevoke: () => void;
  onClose: () => void;
}

const MARGIN = 12;

export function SharePopover({
  project,
  share,
  shareUrl,
  editShareUrl,
  stale,
  x,
  y,
  busy,
  error,
  onPublish,
  onPull,
  onRevoke,
  onClose,
}: SharePopoverProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  // Which link's "복사됨" is showing: "view" | "edit" | null.
  const [copied, setCopied] = useState<"view" | "edit" | null>(null);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = Math.max(MARGIN, Math.min(x, window.innerWidth - width - MARGIN));
    const top = Math.max(MARGIN, Math.min(y, window.innerHeight - height - MARGIN));
    setPos({ left, top });
  }, [x, y, share, stale, editShareUrl]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copy(which: "view" | "edit", url: string | null) {
    if (!url) return;
    try {
      await navigator.clipboard?.writeText(url);
      setCopied(which);
      window.setTimeout(() => setCopied((c) => (c === which ? null : c)), 1600);
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
              보기 링크와 편집 링크를 함께 만들어요. 받는 사람에게 권한에 맞는
              링크를 보내세요 — 보기 링크는 읽기·인쇄만, 편집 링크는 일정 수정까지
              할 수 있어요.
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
            {stale && (
              <div className="share-pull" role="status">
                <span className="share-pull-txt">협업자가 편집했어요</span>
                <button
                  type="button"
                  className="share-pull-btn"
                  disabled={busy}
                  onClick={onPull}
                >
                  {busy ? "가져오는 중…" : "변경 가져오기"}
                </button>
              </div>
            )}

            <p className="share-linklabel">보기 링크 (읽기 전용)</p>
            <div className="share-linkrow">
              <input
                className="cp-input share-link"
                type="text"
                readOnly
                value={shareUrl ?? ""}
                aria-label="보기 링크"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                className="share-copy"
                onClick={() => copy("view", shareUrl)}
                disabled={!shareUrl}
              >
                {copied === "view" ? "복사됨" : "복사"}
              </button>
            </div>

            {editShareUrl ? (
              <>
                <p className="share-linklabel">편집 링크 (수정 가능)</p>
                <div className="share-linkrow">
                  <input
                    className="cp-input share-link"
                    type="text"
                    readOnly
                    value={editShareUrl}
                    aria-label="편집 링크"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <button
                    type="button"
                    className="share-copy"
                    onClick={() => copy("edit", editShareUrl)}
                  >
                    {copied === "edit" ? "복사됨" : "복사"}
                  </button>
                </div>
                <p className="share-cap">
                  이 링크를 받은 사람은 일정을 수정할 수 있어요. 수정은 위
                  ‘가져오기’로 내 캘린더에 반영돼요.
                </p>
              </>
            ) : (
              <p className="share-cap">
                이 공유는 편집 링크가 없어요. ‘갱신’을 누르면 편집 링크가
                만들어져요.
              </p>
            )}

            {publishedLabel && (
              <p className="share-meta">마지막 발행 · {publishedLabel}</p>
            )}
            <p className="share-warn">
              ‘갱신’은 내 로컬 캘린더로 다시 발행해요 — 협업자의 변경을 덮어쓰니
              먼저 ‘가져오기’를 권장해요.
            </p>
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
                title="현재 내 로컬 상태로 다시 발행 (협업자 변경 덮어씀)"
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
