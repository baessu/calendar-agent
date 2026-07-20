/**
 * Auth.js configuration — email magic-link sign-in (US: account sync).
 *
 * Storage split, deliberately:
 *   - Auth records (users, verification tokens) live in Upstash Redis via the
 *     unstorage adapter. Magic links REQUIRE an adapter even with JWT sessions,
 *     and Redis gives single-use tokens an atomic read-and-delete that Blob
 *     cannot — no replay window.
 *   - Calendar data stays in Vercel Blob (see lib/sync/blob.ts). Auth storage
 *     and user data are separate concerns and separate stores.
 *
 * Sessions are JWT, not database-backed: nothing here needs server-side session
 * state, and it avoids next-auth beta.30's `createSession` bug for email + DB
 * sessions (nextauthjs/next-auth#13346).
 *
 * AUTH_URL / AUTH_TRUST_HOST are set explicitly in env rather than relying on
 * header sniffing — the fallback path is what breaks on Next.js 16
 * (nextauthjs/next-auth#13388).
 */
import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { UnstorageAdapter } from "@auth/unstorage-adapter";
import { createStorage } from "unstorage";
import upstashDriver from "unstorage/drivers/upstash";

/**
 * Auth-record storage. Keys are namespaced under "auth" so these records never
 * collide with anything else sharing the Redis database.
 *
 * The KV_REST_API_* names are what the Vercel/Upstash integration actually
 * injects — read them directly rather than aliasing to UPSTASH_REDIS_REST_*,
 * because `vercel env pull` overwrites .env.local and would drop hand-added
 * aliases on every pull.
 */
const storage = createStorage({
  driver: upstashDriver({
    base: "auth",
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  }),
});

/** Whether account sync is wired up. Lets the UI hide sign-in when it isn't. */
export function isAuthConfigured(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL &&
      process.env.KV_REST_API_TOKEN &&
      process.env.AUTH_RESEND_KEY &&
      process.env.AUTH_SECRET,
  );
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: UnstorageAdapter(storage),
  session: { strategy: "jwt" },
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.AUTH_EMAIL_FROM,
      // Magic links are bearer credentials in an inbox — keep the window short.
      maxAge: 10 * 60, // 10 minutes
    }),
  ],
  pages: {
    signIn: "/login",
    verifyRequest: "/login/check-email",
    error: "/login",
  },
  callbacks: {
    /**
     * Persist the user id on the JWT. The sync route keys the per-user Blob
     * document by it, so it must be stable and present on every session.
     */
    jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user && typeof token.uid === "string") {
        session.user.id = token.uid;
      }
      return session;
    },
  },
});
