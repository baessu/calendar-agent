import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

/**
 * Sign-in page — email magic link.
 *
 * The card chrome is static; only the form reads `useSearchParams()` (for the
 * `?error=` Auth.js appends), so it sits behind Suspense. Without the boundary
 * the whole route opts out of prerendering and the build fails.
 */
export default function LoginPage() {
  return (
    <main className="auth-shell">
      <div className="auth-card">
        <h1 className="auth-ttl">캘린더</h1>
        <p className="auth-sub">
          이메일로 로그인하면 기기 간에 캘린더가 동기화됩니다.
        </p>
        <Suspense fallback={<p className="auth-note">불러오는 중…</p>}>
          <LoginForm />
        </Suspense>
        <p className="auth-note">
          비밀번호는 없습니다. 입력한 주소로 일회용 로그인 링크를 보내드려요.
          링크는 10분간 유효합니다.
        </p>
      </div>
    </main>
  );
}
