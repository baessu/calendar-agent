"use client";

import { useEffect } from "react";
import { seedIfEmpty } from "@/lib/db/seed";

/**
 * Runs first-run seeding once on the client. Renders nothing.
 * Idempotent, so a no-op after the first load.
 */
export function DbInit() {
  useEffect(() => {
    seedIfEmpty().catch((err) => {
      console.error("DB seed failed", err);
    });
  }, []);
  return null;
}
