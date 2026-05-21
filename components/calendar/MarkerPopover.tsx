"use client";

/**
 * Marker create / edit popover (US-017).
 *
 * Markers are point-date marks (event / hard deadline) shown as monochrome chips
 * on a day cell — distinct from the colored task bars. This popover lets the user
 * pick the kind (데드라인 ⚑ / 이벤트 ◆), type a label, and choose the date. When
 * opened on an existing marker it prefills the values and offers a two-step inline
 * delete confirmation (no native dialog), matching the Swiss, shadow-less chrome.
 *
 * Empty labels are blocked with an inline message. A transparent backdrop catches
 * outside clicks; ESC / ✕ cancels. Positioned near the click point, clamped to the
 * viewport. Shares the .cp-* styling with the task popovers.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { DateString, Marker, MarkerKind } from "@/lib/types";

/** The marker fields handed back to the parent (already label-trimmed). */
export interface MarkerDraft {
  kind: MarkerKind;
  label: string;
  date: DateString;
}

interface MarkerPopoverProps {
  /** Existing marker to edit; null/undefined opens a fresh "create" form. */
  marker?: Marker | null;
  /** Date the create form starts on (ignored when editing). */
  defaultDate: DateString;
  /** Click viewport coordinates used to anchor the card. */
  x: number;
  y: number;
  onClose: () => void;
  onSave: (draft: MarkerDraft) => void;
  /** Provided only in edit mode; runs after the delete confirmation. */
  onDelete?: () => void;
}

const MARGIN = 12;

export function MarkerPopover({
  marker,
  defaultDate,
  x,
  y,
  onClose,
  onSave,
  onDelete,
}: MarkerPopoverProps) {
  const editing = !!marker;
  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  const [kind, setKind] = useState<MarkerKind>(marker?.kind ?? "deadline");
  const [label, setLabel] = useState(marker?.label ?? "");
  const [date, setDate] = useState<DateString>(marker?.date ?? defaultDate);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Clamp the card inside the viewport once its real size is known.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = Math.max(MARGIN, Math.min(x, window.innerWidth - width - MARGIN));
    const top = Math.max(MARGIN, Math.min(y, window.innerHeight - height - MARGIN));
    setPos({ left, top });
  }, [x, y]);

  // Focus + select the label field on open.
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // ESC closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function save() {
    const trimmed = label.trim();
    if (!trimmed) {
      setError("라벨을 입력하세요");
      inputRef.current?.focus();
      return;
    }
    if (!date) return;
    onSave({ kind, label: trimmed, date });
  }

  return (
    <div className="cp-backdrop" onPointerDown={onClose}>
      <div
        ref={cardRef}
        className="create-pop"
        style={{ left: pos.left, top: pos.top }}
        role="dialog"
        aria-label={editing ? "마커 편집" : "새 마커"}
        // Keep clicks inside the card from reaching the backdrop.
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="cp-head">
          <span className="cp-title">{editing ? "마커 편집" : "새 마커"}</span>
          <button type="button" className="cp-x" aria-label="닫기" onClick={onClose}>
            ✕
          </button>
        </div>

        <form
          className="cp-form"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {/* Kind toggle: filled = active. Monochrome — markers are B/W chips. */}
          <div className="mk-kinds" role="radiogroup" aria-label="마커 종류">
            <button
              type="button"
              role="radio"
              aria-checked={kind === "deadline"}
              className={`mk-kind${kind === "deadline" ? " on" : ""}`}
              onClick={() => setKind("deadline")}
            >
              ⚑ 데드라인
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={kind === "event"}
              className={`mk-kind${kind === "event" ? " on" : ""}`}
              onClick={() => setKind("event")}
            >
              ◆ 이벤트
            </button>
          </div>

          <input
            ref={inputRef}
            className="cp-input"
            type="text"
            value={label}
            placeholder="마커 라벨"
            aria-label="마커 라벨"
            aria-invalid={error ? true : undefined}
            onChange={(e) => {
              setLabel(e.target.value);
              if (error) setError(null);
            }}
          />
          {error && <p className="cp-err">{error}</p>}

          <label className="cp-field">
            <span className="cp-label">날짜</span>
            <input
              className="cp-date"
              type="date"
              value={date}
              aria-label="날짜"
              onChange={(e) => setDate(e.target.value)}
            />
          </label>

          <div className="cp-foot">
            {editing && onDelete ? (
              confirmingDelete ? (
                <span className="cp-confirm" role="alert">
                  <span className="cp-confirm-q">삭제할까요?</span>
                  <button type="button" className="cp-confirm-yes" onClick={onDelete}>
                    삭제
                  </button>
                  <button
                    type="button"
                    className="cp-confirm-no"
                    onClick={() => setConfirmingDelete(false)}
                  >
                    취소
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="cp-del"
                  onClick={() => setConfirmingDelete(true)}
                >
                  삭제
                </button>
              )
            ) : (
              <span />
            )}
            <button type="submit" className="cp-save">
              저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
