# ADR 0005 — Soft auth via magic link (opt-in account upgrade)

- **Status:** Accepted
- **Date:** 2026-05-05
- **Decision-maker:** Nicolas

## Context

Euthus today scopes audits to an anonymous `X-Client-Id` UUID stored
in the browser's `localStorage`. That works for a single browser, but a
user who clears storage, switches devices, or wants to revisit an
audit weeks later has no path back to their reports. Phase 5.3 of the
roadmap asks us to lower that barrier without making accounts
mandatory — a hard signup wall would gate the very behavior the
product is designed to encourage.

Three families of options were considered: passwords, magic link,
OAuth providers, and device-bound passkeys. Each has a different
trade-off across UX friction, operational surface, and cross-device
recovery.

## Decision

Add an **opt-in** magic-link sign-in:

1. The user submits an email at `/entrar`.
2. The backend creates a single-use `MagicLink` record (15-minute TTL)
   and sends an email containing a verify URL pointing at the API.
3. Clicking the link verifies the token, creates a `Session`, sets a
   `httpOnly; SameSite=Lax; Secure` cookie on the API origin, and
   merges previously-anonymous audits from the same `clientId` into
   the new account.
4. Subsequent requests with the cookie scope by `userId`. Requests
   without the cookie continue to scope by `clientId` exactly as they
   did before — the anonymous path is never broken.

We pick magic link over passwords (no signup pain, no password reset,
no breach blast radius), over OAuth (no third-party account required,
no provider branding to manage in the UI, no privacy-policy expansion
for v1), and over passkeys (would not solve the cross-device-recovery
case that motivates this work in the first place).

Email sending is abstracted behind an `EmailSender` interface. The
default in development is a `consoleSender` that pino-logs the magic
link, so a fresh checkout works without any secrets. Production must
set `EMAIL_PROVIDER=resend` plus `RESEND_API_KEY` and `EMAIL_FROM`; if
unset, `POST /api/auth/magic-link` returns **503** with a structured
hint rather than silently falling through to console (Railway's
default log destination is human-readable and partly indexed by URL,
so logging links in prod is a real exfiltration vector).

## Consequences

- **Zero-friction upgrade path.** Anonymous users never see a signup
  form; they choose to upgrade only when the value is clear.
- **DB-leak posture.** Storage holds email plus token _hashes_, never
  raw tokens. A stolen DB does not yield live magic links or sessions.
- **Email deliverability becomes operational.** New surface to monitor.
  Resend bounces and complaints are not yet wired into Grafana — that
  is a follow-up for the soak phase.
- **Email-sender swap is a factory call.** Resend → SES → Postmark → a
  cron-driven SMTP daemon — same `EmailSender` interface, no
  application changes.
- **Cross-domain CORS-credentials path.** The cookie sits on the API
  origin; the frontend reads `/api/auth/me` via `fetch(...,
{ credentials: "include" })`. CORS already allows credentials
  (server.ts), but the audits routes also gain `credentials: "include"`
  on the frontend so the cookie travels with reads/writes.
- **Existing anonymous data is not orphaned.** A migration runs at
  verify time — not as a separate batch job — so the user sees their
  audits already attached the moment they land on `/app`.

## Alternatives considered

- **Passwords (PBKDF2/argon2):** rejected. Adds reset, lockout, and
  breach-response surfaces with no UX benefit over magic link.
- **OAuth (Google/GitHub):** rejected for v1. Drags in provider
  branding, terms, and a privacy-policy expansion. Can be added later
  alongside magic link via the same `Session` model.
- **Passkeys (WebAuthn):** rejected for the cross-device-recovery use
  case this issue exists to solve. Useful as a second factor later.
