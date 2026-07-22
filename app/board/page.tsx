import { BoardApp } from "@/components/board/BoardApp";

// Live task board over the Notion TASK DB. No <SessionBoundary> and no <DbInit>
// here — the board reads Notion server-side (not the viewer's IndexedDB) and
// needs no account session, so it stays a lean, standalone route.
export const metadata = {
  title: "태스크 보드 · 캘린더",
};

export default function BoardPage() {
  return <BoardApp />;
}
