import { CalendarApp } from "@/components/calendar/CalendarApp";

// Editorial shell: infinite-scroll calendar (.ed-main) + right "할일" panel
// (.ed-list) as flex children. <CalendarApp> owns the shared task data so both
// stay in sync. Project tabs arrive in a later story (US-013).
export default function Home() {
  return (
    <main className="app-shell">
      <CalendarApp />
    </main>
  );
}
