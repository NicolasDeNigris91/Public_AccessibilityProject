---
"backend": patch
---

Add per-IP rate limit on `GET /api/auth/verify` to close a CodeQL
`js/missing-rate-limiting` HIGH alert. The endpoint validates magic-link
tokens and was previously bounded only by the global app-level IP limit;
without a route-level limiter an attacker could brute-force tokens at
full HTTP speed.

- New `ipRateLimit` middleware (Redis sorted-set sliding window keyed by IP)
  parallel to `ipEmailRateLimit`. Server.ts wires it on `/verify` with
  defaults of 30 requests / 60s, configurable via `AUTH_VERIFY_RATE_LIMIT_MAX`
  and `AUTH_VERIFY_RATE_LIMIT_WINDOW_MS`.
- `AuthRouterDeps` gains a `verifyRateLimiter?` slot mirroring the existing
  `magicLinkRateLimiter`.
- The `passThrough` fallback inside `auth.ts` is replaced with in-memory
  `rateLimit()` defaults for both `/magic-link` and `/verify`, so the routes
  are never unbounded even if production DI is misconfigured. Tests inject
  `passThrough` stubs explicitly so they aren't blocked by the in-memory
  fallback.
