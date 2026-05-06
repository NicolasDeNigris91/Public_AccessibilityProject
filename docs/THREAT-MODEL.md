# Euthus — Threat Model

> A focused threat model of the soft-auth surface plus the audit
> pipeline boundary, written so a reviewer can see what we defend
> against, what we accept, and exactly where the defense lives.

The format below is STRIDE-lite per surface: a short asset list,
the threats we treat as in-scope, the mitigation **with a file
pointer**, and the residual risk we knowingly accept. Cross-refs:
[ADR 0003 (SSRF)](./adr/0003-ssrf-defense-in-depth.md),
[ADR 0005 (magic link)](./adr/0005-soft-auth-magic-link.md),
[ADR 0006 (session tokens in Mongo)](./adr/0006-session-tokens-in-mongo.md),
[`auth.md`](./auth.md) for non-security wiring.

## Trust boundaries

```
[ user / browser ]
        |  HTTPS, cookies, X-Client-Id
        v
[ frontend (Next.js) ]
        |  /api/* via apiFetch, credentials=include
        v
[ api (Express) ]  <----+
        |               |
        |               +-- [ Resend (email provider) ]
        v
[ Mongo, Redis ]
```

Anything traversing an arrow is a trust boundary; anything inside a
node is trusted. The frontend is **not** trusted with secrets — it
calls the API, which is the policy enforcement point.

## Assets

| #   | Asset                             | Why it matters                                                                      |
| --- | --------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | Magic-link token (raw)            | Short-lived bearer credential. Anyone with it can sign in as the email owner.       |
| 2   | Session cookie (`euthus_session`) | Long-lived bearer credential. Anyone with it speaks for the user for up to 30 days. |
| 3   | User row (email)                  | PII. Identifier across devices.                                                     |
| 4   | Audit results                     | The user's work. Linked to either `clientId` (anonymous) or `userId`.               |
| 5   | Resend API key                    | Production secret. Misuse → arbitrary outbound email from the brand domain.         |

## Surface 1 — `POST /api/auth/magic-link`

**Threats**

- **T1.1 — Mailbox enumeration via timing or response shape.** Sending different statuses for "user exists" vs "doesn't exist" leaks who has an account.
- **T1.2 — Email-bombing a victim.** An attacker hits this route with a victim's email to spam their inbox.
- **T1.3 — IP-level flood.** Saturating the route from one source.
- **T1.4 — Magic link in unprotected log destination.** A misconfigured prod that falls through to `consoleSender` would leak sign-in URLs into stdout.

**Mitigations**

- Always-202 on accepted email shape regardless of whether the user exists. The user row is upserted at `/verify` time, not at request time. Source: [`backend/src/interfaces/http/routes/auth.ts:49-66`](../backend/src/interfaces/http/routes/auth.ts).
- Per-`(ip, email)` rate limit, default 5 / hour, Redis-backed. Composite key keeps a single attacker from grinding through many addresses and a single victim from being hammered from many IPs simultaneously (a single attacker behind a NAT still hits the same `(ip, email)` key). Source: [`backend/src/interfaces/http/middlewares/ipEmailRateLimit.ts`](../backend/src/interfaces/http/middlewares/ipEmailRateLimit.ts).
- Per-`clientId` rate limit further limits the same browser from triggering many distinct emails. Source: [`backend/src/interfaces/http/middlewares/clientIdRateLimit.ts`](../backend/src/interfaces/http/middlewares/clientIdRateLimit.ts).
- Production fail-loud: when `EMAIL_PROVIDER` is unset the route returns **503 with a structured hint**, never silently falls through to `consoleSender`. Source: [`backend/src/infrastructure/email/factory.ts`](../backend/src/infrastructure/email/factory.ts) and the route guard.
- Email is normalised (`trim().toLowerCase()`) before storage so `Foo@x.com` and `  foo@x.com  ` collapse into the same rate-limit bucket. Source: [`backend/src/application/auth/requestMagicLink.ts:19`](../backend/src/application/auth/requestMagicLink.ts).

**Residual risk**

- Mailbox enumeration via **timing** is still theoretically possible if the upsert path on `/verify` becomes measurably slower than the no-op "invalid email" path on `/magic-link`. Today both are dominated by the email round-trip, so timing oracle is impractical, but this assumption deserves periodic re-checking. Not currently instrumented.
- Burst-after-quiet on a freshly provisioned Redis (no prior counters) lets the first window's full 5 emails through before the limit asserts; deemed acceptable since the first 5 cost <1 cent and the long-window IP limit dampens follow-on bursts.

## Surface 2 — `GET /api/auth/verify?token=…`

**Threats**

- **T2.1 — Token replay.** Two parties race to consume the same link.
- **T2.2 — Stolen-link sign-in.** Someone with the email gets the URL (forwarded inbox, shared screen, malware on the recipient's machine).
- **T2.3 — DB peek leaks the raw token.** A read on the `MagicLink` collection surfaces sign-in credentials.
- **T2.4 — Expired link still works.** Time-of-check / time-of-use bug allows expired links.
- **T2.5 — Audit ownership confusion via `X-Client-Id`.** A different browser sending its own `X-Client-Id` on `/verify` could attach the **wrong** anonymous audits to the user.

**Mitigations**

- Atomic single-use: `findOneAndUpdate({ tokenHash, usedAt: null }, { $set: { usedAt: new Date() } }, { new: true })`. The first concurrent claim wins; the loser sees `claimed = null` and gets `401 already_used`. Source: [`backend/src/application/auth/verifyMagicLink.ts:42-47`](../backend/src/application/auth/verifyMagicLink.ts). Race covered by mutation test (`findOneAndUpdate.mockResolvedValueOnce(null)` simulates the loser's view).
- Tokens are 256-bit URL-safe random (`generateToken`) and **SHA-256 hashed at rest**: only `tokenHash` lives in Mongo, never the raw token. Source: [`backend/src/infrastructure/auth/tokens.ts`](../backend/src/infrastructure/auth/tokens.ts), [ADR 0006](./adr/0006-session-tokens-in-mongo.md).
- Strict `expiresAt < Date.now()` check; the 15-minute default TTL is short enough that a leaked link is mostly a DoS, not a hijack. Source: [`backend/src/application/auth/verifyMagicLink.ts:40`](../backend/src/application/auth/verifyMagicLink.ts).
- Audit merge prefers the `clientId` **stored on the link at POST time**, not the header on `/verify`. The header is a defensive fallback for non-browser callers and links issued before the field existed. Source: [`backend/src/interfaces/http/routes/auth.ts:79-87`](../backend/src/interfaces/http/routes/auth.ts).

**Residual risk**

- A leaked URL still works for up to 15 min, regardless of who clicks it. We do not bind the link to the requester's IP / user-agent / client fingerprint — doing so would break the dominant happy path (request from desktop, click on phone). Mitigated by short TTL and one-shot semantics.
- A user who deliberately sends an `X-Client-Id` on `/verify` for a different browser will pull _that_ browser's anonymous audits to their account. Documented as feature, not bug; it's how non-browser clients opt in.

## Surface 3 — Session cookie (`euthus_session`)

**Threats**

- **T3.1 — XSS-stolen cookie used to impersonate the user.**
- **T3.2 — CSRF on state-changing endpoints.**
- **T3.3 — Network sniff of the cookie on plain HTTP.**
- **T3.4 — Stolen cookie still works after logout.**

**Mitigations**

- `HttpOnly` blocks `document.cookie` reads. `Secure` (in production) refuses to traverse plain HTTP. `SameSite=Lax` blocks cross-site state-changing requests. Source: [`backend/src/infrastructure/auth/cookies.ts`](../backend/src/infrastructure/auth/cookies.ts), 100% mutation-tested.
- Cookie value is the **raw** session token; the **server-side row** stores only its `tokenHash` (same SHA-256 scheme as magic links). A DB read can't impersonate any session. Source: [`backend/src/application/auth/getSession.ts`](../backend/src/application/auth/getSession.ts).
- `POST /logout` deletes the `Session` row keyed by `tokenHash`, not just clears the cookie. A stolen cookie therefore stops working at the server immediately. Source: [`backend/src/application/auth/logout.ts`](../backend/src/application/auth/logout.ts).

**Residual risk**

- A successful XSS still allows the attacker's payload to make authenticated requests _from the victim's browser_ during the page lifetime, even with `HttpOnly`. We rely on the frontend's CSP and the absence of `dangerouslySetInnerHTML` in user-controlled paths. CSP hardening is on the post-rc.2 backlog.
- `SameSite=Lax` does not protect top-level GET navigations triggered cross-site (e.g. `<img src=…/api/auth/logout>` in a Markdown-heavy site). Logout is `POST` for this reason, but any future authenticated GET that mutates state would be at risk; reviewers should reject such routes.

## Surface 4 — Anonymous → user audit merge

**Threats**

- **T4.1 — Cross-account audit theft.** A user provides a `clientId` that belongs to someone else's anonymous browser, claiming their audits.
- **T4.2 — Server scans every audit on every verify.** Performance footgun on a busy DB.

**Mitigations**

- The merge is gated by the `clientId` stored on the user's own magic-link row at POST time, in the same browser that originally collected the anonymous audits. To steal someone else's audits, the attacker would need to (a) know their target's `clientId`, _and_ (b) have the magic link emailed to a mailbox they control with that same `clientId` on the request — i.e. control the victim's request flow, at which point they already have the account. Source: [`backend/src/application/auth/mergeAnonymousAudits.ts`](../backend/src/application/auth/mergeAnonymousAudits.ts), 100% mutation-tested.
- The `updateMany({ clientId, userId: { $exists: false } })` filter only touches **anonymous** audits with the matching `clientId`; pre-existing user-attached audits are never reassigned, even if the same `clientId` reappears later from a different browser.
- `auth_anonymous_audits_merge_total{outcome=…}` and `auth_anonymous_audits_moved_total` give the on-call a quick read on whether merges are happening at the rate the product expects. `clientId` and `userId` are in the structured log only — never as Prometheus labels — to bound cardinality. Source: [`backend/src/infrastructure/metrics/registry.ts`](../backend/src/infrastructure/metrics/registry.ts).

**Residual risk**

- A user who clears cookies between submitting anonymous audits and signing in will not get the merge: the new browser has a new `clientId`, the link they request will store _that_, and the prior anonymous audits remain unattached. Documented behavior; out of scope to fix without a new identifier.

## Surface 5 — Email provider (Resend)

**Threats**

- **T5.1 — API key compromise.** An attacker sends arbitrary email from the brand domain.
- **T5.2 — Provider outage breaks sign-in.**
- **T5.3 — Resend retries deliver the same magic link multiple times.**

**Mitigations**

- `RESEND_API_KEY` is read once from env at boot; never written to logs (gitleaks runs on every push to enforce). Rotation is a one-line env update + redeploy.
- The route 202s as soon as the link is queued; provider degradation surfaces as a 5xx on the route handler, not a hung user request, so it's caught by the API-availability SLO and the on-call paging path.
- Magic-link single-use semantics already neutralise multi-delivery: only the first click consumes the token.

**Residual risk**

- No backup provider yet. A multi-hour Resend outage means no sign-ins during that window; existing sessions continue to work because they don't depend on the email path. **Resend circuit breaker + fallback are tracked on the post-rc.2 backlog.**

## Cross-cutting

### Secrets handling

- All secrets read from env (`RESEND_API_KEY`, `MONGODB_URI`, `REDIS_URL`, etc.). Never committed.
- Husky pre-commit + CI gitleaks scan; CI blocks on findings, local runs as a soft skip.
- `.env*` files are gitignored.

### Transport

- HTTPS terminates at the public edge. The `Secure` cookie attribute is enforced in production; setting `cookieSecure: true` on the auth router is wired off `NODE_ENV` at server startup.
- CORS is per-origin allowlist (frontend origin only) with `Access-Control-Allow-Credentials: true`. Any change there breaks `/me` / `/logout` immediately, so the regression surfaces fast.

### Audit log

- Every auth-related state change emits a structured pino log:
  - `magic link issued` (request side)
  - `auth.merge_anonymous_audits` with outcome (merge side)
  - `requestId` is propagated from the inbound request, so a single sign-in can be traced end-to-end.
- Sessions table also writes `lastUsedAt` on every `getSession` so a stale-session sweep can identify dormant cookies.

### SSRF (audit pipeline, not auth)

Out of scope for this doc but adjacent. See [ADR 0003](./adr/0003-ssrf-defense-in-depth.md): pre-resolution, allowlist-by-IP-class, and Playwright `route()` interception combine to prevent the audit worker from reaching internal addresses on behalf of an attacker-controlled URL.

## Out of scope / accepted risks

| Risk                                           | Status   | Notes                                                                                                                                    |
| ---------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Account recovery if the email provider is lost | Accepted | Magic link is the only auth factor by design; losing email = lose account. Documented in [ADR 0005](./adr/0005-soft-auth-magic-link.md). |
| 2FA / WebAuthn                                 | Backlog  | Not required for the current threat profile (no high-value transactions).                                                                |
| Per-session device binding / fingerprinting    | Accepted | Adds friction without meaningfully raising the bar against the documented threats.                                                       |
| Provider failover for email                    | Backlog  | Resend circuit breaker tracked separately.                                                                                               |
| CSP hardening                                  | Backlog  | Mitigates T3.1 indirectly. Tracked.                                                                                                      |
| Subresource integrity for third-party scripts  | N/A      | No third-party scripts on the auth pages.                                                                                                |

## Review cadence

This doc is reviewed when any of the following happen:

- A new auth-surface route is added.
- A new external dependency lands in the auth path (provider, queue, store).
- A security-relevant ADR is opened or changed.
- An incident touches any of the surfaces above.

Otherwise, a calendar review every 6 months catches drift.
