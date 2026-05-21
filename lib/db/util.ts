/** Generate a stable unique id (crypto.randomUUID, with a safe fallback). */
export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Non-cryptographic fallback for environments without crypto.randomUUID.
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Current timestamp in epoch milliseconds. */
export function now(): number {
  return Date.now();
}
