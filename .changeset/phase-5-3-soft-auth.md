---
"backend": minor
"frontend": minor
---

Phase 5.3 — Soft auth via magic link.

- New routes (backend): `POST /api/auth/magic-link`, `GET /api/auth/verify`,
  `GET /api/auth/me`, `POST /api/auth/logout`. Plus a non-prod test hatch
  `GET /api/auth/__test/last-link?email=…` for e2e flows.
- Anonymous flow (`X-Client-Id`) preserved unchanged. Audits scope by
  `userId` when the session cookie resolves and by `clientId` otherwise;
  POSTs from a signed-in caller record both so `mergeAnonymousAudits`
  can attach prior anonymous audits on first verify when an
  `X-Client-Id` accompanies the request.
- Email is sent via an `EmailSender` abstraction. Dev defaults to a
  console sender (link printed to logs as `magic link issued`). Prod
  requires `EMAIL_PROVIDER=resend` plus `RESEND_API_KEY` and `EMAIL_FROM`,
  or the magic-link endpoint returns 503 with a structured hint — never
  silently degrades to a console log where sign-in links could leak.
- Sessions are opaque random tokens hashed with SHA-256 and stored in
  Mongo (ADR 0006). 30-day TTL, immediate revocation on logout. Cookie
  is `euthus_session`, `HttpOnly`, `SameSite=Lax`, `Secure` in prod.
- Per-(ip, email) rate limit on `/magic-link`: defaults to 5 per hour,
  Redis-backed with the same fail-open semantics as the existing
  per-clientId limiter.
- Frontend: `/entrar` (request form) → `/entrar/check` (inbox cue) →
  `/entrar/verify` (cross-origin redirect helper). New `SessionPill`
  in the header, `useSession` SWR hook, typed `auth.ts` client, and
  `credentials: "include"` on every API call.
- Migration `20260505-auth-collections.js` ships the indexes for
  `users` / `magiclinks` / `sessions` plus the new
  `audits.userId+createdAt` index.

Reference: [docs/auth.md](docs/auth.md).
