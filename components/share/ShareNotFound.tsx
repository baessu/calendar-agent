/**
 * Friendly fallback for a missing / revoked / malformed share link (US-024).
 * Server component (no interactivity) — monochrome, matches the app shell.
 */
export function ShareNotFound() {
  return (
    <div className="share-empty">
      <div className="share-empty-card">
        <h1 className="share-empty-ttl">공유 캘린더를 찾을 수 없어요</h1>
        <p className="share-empty-body">
          링크가 잘못되었거나, 공유가 해제되었을 수 있어요. 링크를 보낸 분에게
          다시 확인해 주세요.
        </p>
      </div>
    </div>
  );
}
