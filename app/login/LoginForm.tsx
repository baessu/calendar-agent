"use client";

/**
 * The magic-link request form.
 *
 * Deliberately a NATIVE form POST to /api/auth/signin/resend rather than the
 * `signIn` server action: that action is what currently fails on Next.js 16
 * (nextauthjs/next-auth#13388). A plain form lets the browser follow Auth.js's
 * redirect to the verify page, and it keeps working with JS disabled. The only
 * thing JS does here is fetch the CSRF token Auth.js requires — until it
 * arrives the submit button stays disabled.
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export function LoginForm() {
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const params = useSearchParams();
  const error = params.get("error");
  // Return the user to where they were headed (e.g. /board) after sign-in.
  // Only same-origin relative paths are honored, so this can't be turned into
  // an open redirect by a crafted ?callbackUrl=.
  const raw = params.get("callbackUrl");
  const callbackUrl = raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/csrf")
      .then((r) => r.json())
      .then((d: { csrfToken?: string }) => {
        if (!alive) return;
        if (d.csrfToken) setCsrfToken(d.csrfToken);
        else setFailed(true);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <>
      {error && (
        <p className="auth-err" role="alert">
          로그인에 실패했습니다. 링크가 만료됐거나 이미 사용된 링크일 수 있어요.
          다시 시도해 주세요.
        </p>
      )}
      {failed && (
        <p className="auth-err" role="alert">
          로그인 준비에 실패했습니다. 새로고침 후 다시 시도해 주세요.
        </p>
      )}

      <form method="post" action="/api/auth/signin/resend" className="auth-form">
        <input type="hidden" name="csrfToken" value={csrfToken ?? ""} />
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <label className="auth-label" htmlFor="email">
          이메일
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          placeholder="you@example.com"
          className="auth-input"
        />
        <button type="submit" className="auth-btn" disabled={!csrfToken}>
          {csrfToken ? "로그인 링크 받기" : "준비 중…"}
        </button>
      </form>
    </>
  );
}
