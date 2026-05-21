import { CalendarView } from "@/components/calendar/CalendarView";

// Editorial shell. Right "할일" panel + project tabs arrive in later stories
// (US-008 / US-013); for now the calendar fills the main column.
export default function Home() {
  return (
    <main className="app-shell">
      <CalendarView />
    </main>
  );
}
