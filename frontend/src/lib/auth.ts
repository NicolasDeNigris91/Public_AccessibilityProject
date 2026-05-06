// Typed client for /api/auth/*. Uses the shared API base so
// `next dev` against a separate backend works the same as a single-origin
// production deploy. Requests always send credentials so the session
// cookie travels both ways.

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface SessionUser {
  id: string;
  email: string;
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; hint?: string };
  requestId?: string;
}

async function readError(res: Response): Promise<string> {
  let body: ErrorEnvelope = {};
  try {
    body = (await res.json()) as ErrorEnvelope;
  } catch {
    // Non-JSON (express-rate-limit fallback, etc.).
  }
  return body.error?.code ?? `http_${res.status}`;
}

export async function requestMagicLink(email: string): Promise<void> {
  // A fresh idempotency key per call. The server dedupes a same-key
  // retry inside the link's TTL (15 min) so an accidental double-submit
  // or transparent network retry doesn't burn a second email; distinct
  // user actions get distinct keys, which is what we want.
  const idempotencyKey =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 18)}`;
  const res = await fetch(`${API}/api/auth/magic-link`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ email }),
  });
  if (res.ok) return;
  throw new Error(await readError(res));
}

export async function fetchSession(): Promise<SessionUser | null> {
  const res = await fetch(`${API}/api/auth/me`, { credentials: "include" });
  if (!res.ok) return null;
  const body = (await res.json()) as { user: SessionUser | null };
  return body.user ?? null;
}

export async function logout(): Promise<void> {
  await fetch(`${API}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}
