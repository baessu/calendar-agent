/**
 * Share tokens (US-023).
 *
 * A token is the unguessable handle in a share URL (/s/{token}) and the Blob
 * pathname (shares/{token}.json). It must be URL-safe and have enough entropy
 * that it can't be guessed or enumerated. We use 18 random bytes (144 bits)
 * encoded base36-ish via hex→compact, far beyond brute-force reach.
 */

/** URL-safe alphabet (no padding, no look-alike-hostile chars needed here). */
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Number of random characters in a token (~26 chars ≈ 134 bits). */
export const TOKEN_LENGTH = 26;

/**
 * A cryptographically-random, URL-safe token. Uses Web Crypto
 * (crypto.getRandomValues), available in the browser and in the Node/edge
 * runtimes we publish from.
 */
export function newShareToken(length: number = TOKEN_LENGTH): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/** Whether a string is a syntactically valid share token (defensive routing). */
export function isValidToken(token: string): boolean {
  return token.length >= 16 && token.length <= 64 && /^[0-9a-z]+$/.test(token);
}

/** The Blob pathname a token's snapshot is stored at. */
export function snapshotPath(token: string): string {
  return `shares/${token}.json`;
}
