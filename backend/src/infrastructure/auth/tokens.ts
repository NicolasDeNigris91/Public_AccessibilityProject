import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

/**
 * 32 random bytes encoded as URL-safe base64 (43 chars, no padding).
 * High entropy guards against guessing; URL-safe lets the token live
 * in a magic-link query string without escaping.
 */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 hex digest. Storage form for tokens. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Constant-time comparison. Returns false (rather than throwing) on
 * length mismatch so callers do not need a separate guard.
 */
export function tokensMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
