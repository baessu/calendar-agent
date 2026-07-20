"use client";

/**
 * Client boundary for next-auth's SessionProvider.
 *
 * The root layout is a server component, so the provider needs a "use client"
 * wrapper. Kept as its own file so the layout stays a server component and only
 * this subtree ships to the browser.
 */
import { SessionProvider } from "next-auth/react";

export function SessionBoundary({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
