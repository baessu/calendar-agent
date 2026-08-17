import { redirect } from "next/navigation";
import { auth } from "@/auth";
import MessengerApp from "./MessengerApp";

// AI Teams 라이브 메신저 — 여러 기기의 에이전트 활동 피드를 한 화면에서 본다.
// /cockpit·/board와 같은 이유로 로그인 게이트: 프롬프트·보고 원문이 담긴다.
export const metadata = { title: "AI Teams 메신저 · 캘린더" };

export default async function MessengerPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/messenger");
  return <MessengerApp />;
}
