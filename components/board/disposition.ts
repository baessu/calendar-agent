/**
 * Presentation helpers for dispositions — shared by the card and the menu.
 *
 * The board is monochrome (calendar-agent's Swiss shell), so a disposition is
 * conveyed by a short label and a left hairline weight, NOT a fill color. This
 * maps each raw Notion `액션 태그` to its display label and an urgency tier the
 * CSS uses for that hairline.
 */
import type { Disposition } from "@/lib/board/types";

/** Short label for any disposition, including values not in the change menu. */
export function dispositionLabel(d: Disposition): string {
  switch (d) {
    case "🔴 당장하세요 (중요+긴급)":
      return "지금 · 중요+긴급";
    case "🔴 당장하세요":
    case "🔴":
      return "지금";
    case "📅 일정잡으세요":
      return "일정 잡기";
    case "👋 위임하세요":
      return "위임";
    case "🗑️ 제거하세요":
    case "🗑️":
      return "제거";
    case null:
      return "미정";
    default:
      // An action tag we don't have a label for — show it raw rather than hide.
      return d;
  }
}

/**
 * Urgency tier 0–3 → CSS `data-tier`, driving the card's left hairline weight
 * (heavier = more urgent). Keeps color out of it; emphasis is line, not hue.
 */
export function dispositionTier(d: Disposition): 0 | 1 | 2 | 3 {
  if (d?.startsWith("🔴")) return 0; // do now
  if (d === "📅 일정잡으세요") return 1; // schedule
  if (d === "👋 위임하세요" || d === "🗑️ 제거하세요" || d === "🗑️") return 2;
  return 3; // untriaged / unknown
}

/** "45분" / "2시간 30분" / "" from an estimated-minutes value. */
export function formatEstimate(min: number | null): string {
  if (min == null || min <= 0) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}시간 ${m}분`;
  if (h) return `${h}시간`;
  return `${m}분`;
}
