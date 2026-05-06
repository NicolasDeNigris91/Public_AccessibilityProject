# ADR 0006 — Session tokens stored in Mongo (not JWT)

- **Status:** Accepted
- **Date:** 2026-05-05
- **Decision-maker:** Nicolas

## Context

ADR 0005 introduces an authenticated session. Two natural approaches
present themselves: opaque random tokens stored server-side, or signed
JWTs in cookies that the API validates without a DB read.

The initial preference was JWT (15-minute access token + rotating
refresh token, both in `httpOnly; SameSite=Lax` cookies, refresh
rotation route at `/api/auth/refresh`). Re-evaluation flipped that on
two grounds: revocation is a hard requirement (logout must end the
session immediately, not "after 15 minutes"), and the project runs as
a single Railway service against a single Mongo Atlas cluster with no
horizontal-scaling pressure that JWT would relieve.

## Decision

Use **opaque random tokens** (32 bytes, base64url-encoded, 43 chars on
the wire) stored as their SHA-256 hashes in a `sessions` collection.
The cookie carries the raw token; the database stores only the hash.
A request resolves to a session by hashing the cookie value and
looking up the row.

Sessions carry `userId`, `tokenHash`, `expiresAt` (30 days from
creation), `createdAt`, `lastUsedAt`. Logout deletes the row. A TTL
index on `expiresAt` reaps expired sessions automatically.

Tokens are generated with `crypto.randomBytes(32)` and compared in
constant time (`crypto.timingSafeEqual`) so a malicious caller cannot
side-channel the hash by timing the verify endpoint.

## Consequences

- **Immediate revocation.** Logging out invalidates the session in one
  DB delete. No JWT denylist, no waiting for a short-TTL access token
  to age out. "Sign me out everywhere" later is a single DB query.
- **No symmetric secret to rotate.** Removes a class of operational
  incidents (leaked JWT secret → mass session invalidation drama).
- **One DB read per authenticated request.** With Mongoose's connection
  pool and the existing read patterns, this is well below the API
  latency budget; Mongo Atlas P95 read at our cluster size is
  sub-2ms. The session lookup hits a unique index on `tokenHash`.
- **DB-leak posture.** SHA-256 hashing means a stolen DB does not yield
  usable cookies. An attacker would need to win a preimage race
  against 32-byte uniformly-random inputs.
- **Cannot validate tokens offline.** Not a concern for this product:
  every consumer of the cookie is the API itself.

## Alternatives considered

- **JWT (HS256 in cookie):** rejected. Single-region single-API
  service has no horizontal-scaling pressure that JWT would relieve,
  and we end up needing a denylist anyway to support immediate
  logout. Net complexity loss.
- **JWE (encrypted JWT):** rejected for the same reason plus the added
  key-management burden.
- **Short JWT access token + DB-backed refresh token:** rejected.
  Combines the worst of both: per-request DB read on refresh, plus the
  symmetric-secret operational surface of JWT, plus a moving 15-minute
  window where a compromised access token cannot be revoked.
