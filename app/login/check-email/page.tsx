/**
 * Post-submit page — Auth.js redirects here (configured as `verifyRequest`)
 * once the magic link has been sent. Deliberately says nothing about whether
 * the address has an account: that would turn the form into an account
 * enumeration oracle.
 */
export default function CheckEmailPage() {
  return (
    <main className="auth-shell">
      <div className="auth-card">
        <h1 className="auth-ttl">메일함을 확인하세요</h1>
        <p className="auth-sub">
          로그인 링크를 보냈습니다. 메일의 링크를 열면 로그인됩니다.
        </p>
        <p className="auth-note">
          링크는 10분간 유효하며 한 번만 사용할 수 있습니다. 메일이 보이지 않으면
          스팸함도 확인해 주세요.
        </p>
        <a href="/login" className="auth-link">
          다른 주소로 다시 시도
        </a>
      </div>
    </main>
  );
}
