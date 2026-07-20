import { CalendarApp } from "@/components/calendar/CalendarApp";
import { DbInit } from "@/components/db-init";
import { SessionBoundary } from "@/components/sync/SessionBoundary";

// Editorial shell: infinite-scroll calendar (.ed-main) + right "일정" panel
// (.ed-list) as flex children. <CalendarApp> owns the shared task data so both
// stay in sync. <DbInit> runs first-run seeding here (not in the root layout)
// so the public /s/[token] share route never touches a viewer's local DB.
//
// <SessionBoundary> is scoped here rather than to the root layout for the same
// reason: next-auth's SessionProvider fetches /api/auth/session on mount
// unconditionally (not lazily on useSession), so mounting it globally would
// make every anonymous share viewer issue a pointless auth request.
export default function Home() {
  return (
    <main className="app-shell">
      <DbInit />
      <SessionBoundary>
        <CalendarApp />
      </SessionBoundary>
    </main>
  );
}
