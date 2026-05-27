import { CalendarApp } from "@/components/calendar/CalendarApp";
import { DbInit } from "@/components/db-init";

// Editorial shell: infinite-scroll calendar (.ed-main) + right "일정" panel
// (.ed-list) as flex children. <CalendarApp> owns the shared task data so both
// stay in sync. <DbInit> runs first-run seeding here (not in the root layout)
// so the public /s/[token] share route never touches a viewer's local DB.
export default function Home() {
  return (
    <main className="app-shell">
      <DbInit />
      <CalendarApp />
    </main>
  );
}
