import Dexie from "dexie";

/**
 * Local IndexedDB store (Dexie).
 *
 * US-001 scaffolds an empty instance only; the Project/TaskType/Task/Marker
 * schema, seeds, and CRUD land in US-002. Browser-only: Dexie touches
 * IndexedDB on open(), so import `db` from client components.
 */
export class CalendarDB extends Dexie {
  constructor() {
    super("CalendarDB");
    // Schema intentionally empty; tables are declared in US-002.
    this.version(1).stores({});
  }
}

export const db = new CalendarDB();
