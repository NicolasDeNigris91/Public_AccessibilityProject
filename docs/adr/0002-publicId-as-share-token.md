# ADR 0002 — `publicId` is the share token, no auth on `GET /api/audits/:publicId`

- **Status:** Accepted
- **Date:** 2026-04-20
- **Decision-maker:** Nicolas

## Context

A user submits a URL, gets a `publicId` UUID v4 back, and wants to share
the audit report with a colleague. There are two natural shapes:

1. **Authenticate the report endpoint.** Every read of
   `/api/audits/:publicId` requires the same `X-Client-Id` that
   submitted it. Sharing means giving the other person your client id,
   which would also let them see your _whole_ history.
2. **Treat the publicId as a capability token.** Anyone with the URL
   can read it; the URL itself is the auth.

## Decision

Option 2. `GET /api/audits/:publicId` is public; the list endpoint
`GET /api/audits` remains scoped by `X-Client-Id`.

Reasoning:

- UUID v4 has 122 bits of entropy. Brute-forcing a single audit URL is
  not a practical attack against this app.
- The threat model is "stranger learns the URL of an audit _that
  someone chose to share_". That's the desired flow.
- The leak surface is the audited URL itself (which is text the user
  asked us to load) and a list of axe violations. No PII, no internal
  data.
- Optional `unlist` flag is documented as a follow-up if we ever audit
  authenticated dashboards.

## Consequences

- Sharing is a copy-paste. No invitation flow needed.
- Anyone who _guesses_ a publicId reads someone else's audit URL.
  We accept this as v4 collision risk only.
- If we ever onboard regulated industries, the report endpoint moves
  behind a session and the publicId stops being a capability — that's
  a contract change, called out in the SECURITY.md changelog.
