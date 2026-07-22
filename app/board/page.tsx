import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BoardApp } from "@/components/board/BoardApp";

// The board shows the owner's real Notion TASK DB (task titles, projects — all
// sensitive) on a PUBLIC site, so it MUST be gated. Unlike the calendar
// (local-first, per-browser) or a share (unguessable token), an ungated /board
// would expose the whole task list at a fixed URL. Require a signed-in session;
// the API routes enforce the same check server-side so the data itself is
// protected, not just this page.
export const metadata = {
  title: "태스크 보드 · 캘린더",
};

export default async function BoardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/board");
  return <BoardApp />;
}
