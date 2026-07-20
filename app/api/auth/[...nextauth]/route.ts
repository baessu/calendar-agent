/**
 * Auth.js route handler — serves the whole /api/auth/* surface (sign-in POST,
 * magic-link callback, sign-out, session, CSRF).
 *
 * Uses `handlers` directly rather than the `signIn` server action, which is
 * the pattern that currently fails on Next.js 16 (nextauthjs/next-auth#13388).
 */
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
