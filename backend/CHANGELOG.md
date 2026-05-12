# backend

## 0.2.1

### Patch Changes

- dae761b: Upgrade OpenTelemetry stack and override `protobufjs` to clear all
  production high-severity advisories. After this change,
  `npm audit --workspace backend --omit=dev` reports
  `found 0 vulnerabilities`.
  - `@opentelemetry/auto-instrumentations-node` `^0.74.0` → `^0.75.0`,
    `@opentelemetry/sdk-node` `^0.216.0` → `^0.217.0`, and
    `@opentelemetry/exporter-trace-otlp-http` `^0.216.0` → `^0.217.0`.
    Closes GHSA-q7rr-3cgh-j5r3 (high): Prometheus exporter process
    crash via malformed HTTP request.
  - Override `protobufjs` → `^8.0.3` at the root.
    `@opentelemetry/otlp-transformer@0.217.0` pins `"protobufjs": "8.0.1"`
    exactly. The advisory range is `>=8.0.0 <=8.0.1` and upstream has
    published 8.0.2 / 8.0.3 / 8.2.0 outside it. The override forces the
    install to 8.2.0, the latest non-vulnerable release, closing
    GHSA-q6x5-8v7m-xcrf (overlong UTF-8 decoding), GHSA-2pr8-phx7-x9h3
    (DoS via crafted field names), GHSA-66ff-xgx4-vchm (code injection
    via bytes field defaults), GHSA-fx83-v9x8-x52w (prototype injection
    in generated constructors), GHSA-75px-5xx7-5xc7 (code-gen gadget
    after prototype pollution), GHSA-jvwf-75h9-cwgg (DoS via unsafe
    option paths), and GHSA-685m-2w69-288q (DoS via unbounded
    recursion).

  Also implicitly resolves the `Dependabot Updates` daily failure on
  the protobufjs advisory: with `protobufjs` installed at 8.2.0, the
  security scan is a no-op rather than `fix_available: false`.

  When upstream `@opentelemetry/otlp-transformer` bumps its `protobufjs`
  dep to a non-pinned caret range (or pins to a non-vulnerable
  version), the override becomes inert and can be removed.

## 0.2.0

### Minor Changes

- b46085b: Phase 3 — performance + polish foundation:
  - Worker isolates each audit in its own Puppeteer `BrowserContext`, with a
    warmup at boot to remove the first-job cold start.
  - Repository now uses `@changesets/cli` for versioning and changelog. Every
    PR to `main` must ship a changeset (label `skip-changeset` to bypass for
    pure docs / CI changes).

- 83f1be7: Phase 4.1 — close the three known WCAG 2.2 AA gaps tracked in
  `docs/A11Y-AUDIT.md`:
  - **3.3.1 / 3.3.3 Error Identification & Suggestion**: the dashboard
    form on `/app` and the reaudit button on `/audits/[id]` now surface a
    `role="alert"` block with a pt-BR message mapped from the backend
    error envelope (`postJson` + `errorMessages.ts`). 429 and network
    errors get specific copy too.
  - **4.1.3 Status Messages**: `StatusShell` wraps title + url + hint in a
    `role="status"` + `aria-live="polite"` + `aria-atomic="true"` region,
    so the `queued → running → done|failed` transitions the SWR poll
    drives are announced to screen readers without navigating away.
  - **2.4.2 Page Titled**: `app/audits/[id]/page.tsx` is now a Server
    Component that exports `generateMetadata`. The metadata fetches the
    audit URL server-side (3 s timeout, 30 s revalidate) and renders
    `Auditoria de <host> — Euthus`, falling back to a generic title on
    miss / error. The client-side rendering moved to `AuditDetailView`.

- e53a585: Phase 4.2 — end-to-end OpenTelemetry tracing.

  `@opentelemetry/sdk-node` + `auto-instrumentations-node` boot from a
  tiny preamble at the top of each entry point (`instrumentationApi.ts`,
  `instrumentationWorker.ts`). HTTP / express / mongoose / ioredis are
  auto-instrumented. The `/health`, `/ready`, `/metrics` probes are
  filtered to keep traces signal-rich.

  **Producer / consumer span linking** across the BullMQ boundary is
  manual (BullMQ has no official auto-instrumentation): the api-side
  `POST /api/audits` runs inside an `audit.enqueue` span and attaches
  the W3C `traceparent` to the job payload. The worker dispatches every
  job through `audit.process` (re-entering that context) and wraps the
  Puppeteer + axe pipeline in `audit.run`.

  **Off by default.** When `OTEL_EXPORTER_OTLP_ENDPOINT` is unset the
  SDK is never started — local dev and CI keep zero-overhead behavior.
  Optional `OTEL_EXPORTER_OTLP_HEADERS` (comma-separated `k=v` pairs)
  covers Grafana Cloud free-tier basic-auth.

  **Defensive choices documented in ADR 0004:**
  - OTLP/HTTP only (no gRPC dep weight).
  - Bounded span attribute cardinality: `audit.url_host` (hostname only,
    never the full URL) and `audit.public_id`.
  - Logs and metrics keep their existing transports (pino + Prometheus).

  Tests: `tracer.test.ts` covers the noop branch; `spans.test.ts`
  covers `withSpan` / `captureTraceparent` / `withRestoredContext`.
  The SDK-on path requires a live collector and is exercised in the e2e
  deployment, not Jest. 195 unit tests pass overall.

- 1261295: Phase 4.3 — explicit dead-letter queue + Bull-Board admin UI.

  **Dead-letter queue.** Audit jobs that exhaust all attempts now move to
  a separate `audits-dead` BullMQ queue rather than rotting on the live
  queue's `failed` set. The DLQ payload carries the original
  `AuditJobData` plus `failedAt`, `errorMessage`, `attemptsMade`. The
  move is **idempotent** (`jobId = dead:<publicId>`) and **defensive**
  (any error from the deadQueue write is logged and swallowed so the
  worker can never crash because the DLQ is misconfigured).

  The move logic is a pure function (`moveToDeadLetterIfFinal`) wired
  from `auditWorker.on("failed", ...)` so the policy is unit-tested
  without Redis or BullMQ — 8 tests cover happy path, retry-still-
  pending skip, idempotency, single-attempt jobs, error-class
  classification, redis-down resilience, and BullMQ edge cases.

  **Metric.** New counter `audit_dead_letter_total{reason}` exposed on
  both the api and worker `/metrics` endpoints. `reason` is the same
  low-cardinality bucket already used by `audit_failure_total`
  (`timeout` / `network` / `ssrf` / `browser_crash` / `other`).

  **Bull-Board UI.** Mounted at `/admin/queues` showing both the live
  `audits` queue and the new `audits-dead` queue, behind HTTP basic auth.
  The `basicAuth` middleware compares creds with `crypto.timingSafeEqual`
  on padded buffers (length-equality also checked) so neither the right
  answer nor the secret length leaks through timing. The admin route is
  **only mounted when both `ADMIN_USER` and `ADMIN_PASS` env vars are
  set** — a forgotten env in prod cannot accidentally serve the UI
  without authentication. 7 integration tests cover the env gate, both
  auth failure paths, the success path, and queue registration.

  **Runbook.** `docs/runbooks/dlq-replay.md` documents the diagnosis →
  mitigation → follow-up flow for "DLQ is filling up", with explicit
  guidance against an auto-replay button (jobs are in the DLQ for a
  reason; a human must triage).

  185 unit tests pass (was 161); coverage 99.29 / 84.00 (lines /
  branches), well above the 80 / 75 gates.

- 7c1b9ae: Phase 4.5 — expand Stryker mutation testing surface beyond `domain/` to
  include the `application/` and `interfaces/http/` layers.
  - `stryker.config.json` mutate glob now also includes
    `application/{assertSafeUrl,resolveSafeAddress,subrequestPolicy}.ts`,
    the four `interfaces/http/middlewares/*` files, and
    `interfaces/http/routes/audits.ts`.
  - Mutation workflow watches changes under `application/` and
    `interfaces/http/` too, with `timeout-minutes` raised to 30 to
    accommodate the bigger surface (was 15).
  - Global break threshold stays at 70 % (current score: 77.08 %).
    application/ is at 79.59 % — within striking distance of the 80 %
    goal called out in the QUALITY-AUDIT plan.
  - Two integration tests added to kill mutants surviving on
    `routes/audits.ts`: explicit newest-first sort assertion (with three
    docs in reverse-chronological insertion order so a missing
    `.sort({ createdAt: -1 })` is detectable) and an exact key-set
    assertion on the list response.
  - One unit test added on `assertSafeUrl` covering an IPv6-bracketed
    hostname so the `^\[|\]$/g` strip is exercised.

  The new tests revealed a real leak in the audit routes: both
  `GET /api/audits` and `GET /api/audits/:publicId` were returning
  Mongo's `_id` (and on the detail endpoint, `__v`, `clientId`,
  `updatedAt`) along with the documented contract. The route handlers
  now `.select(...)` the documented fields explicitly with `-_id`,
  matching the long-standing comment in `domain/contracts.ts`. A new
  integration test guards each side against future regressions.

  Coverage and tests: 161 unit tests pass (+3 vs fix branch); coverage
  99.15 / 80.32 (lines / branches), well above the 80 / 75 gates.

- 786c3db: Phase 5.1 — Real User Monitoring via Core Web Vitals.

  The frontend now ships a tiny `<RumTracker />` mounted in the root
  layout that listens for LCP / INP / FCP / TTFB / CLS via the
  `web-vitals` library and beacons each metric to `POST /api/rum` on
  the backend. `navigator.sendBeacon` is preferred (rides the
  page-unload phase reliably); fetch + `keepalive` is the fallback.

  Backend exposes one Prometheus histogram per metric (web*vital*\*\_seconds
  plus the unitless `web_vital_cls`) with `route` labels constrained to
  the documented page routes — no per-audit-id explosion. Buckets are
  sized to the Web Vitals "good / needs improvement / poor" thresholds
  so dashboards can colour the bars natively.

  The dispatcher rejects unknown names, unknown routes, and out-of-range
  values, counting each in `web_vital_rejected_total{reason}`. The
  endpoint always 204s (a beacon is fire-and-forget; surfacing 4xx on
  sendBeacon would just confuse devtools logs).

  Tracker is **production-only** so `npm run dev` doesn't spam the
  metric backend.

  Tests: 28 backend (rumDispatch + rum route) and 17 frontend (rum
  helper + route classifier). Total backend 223 / frontend 101.
  Coverage 98.31 / 82.82 (backend) and 84.51 / 59.81 (frontend), all
  above gates. Bundle budget unchanged within 1 KB on each route.

- 8514be0: Phase 5.2 — Server-Sent Events for audit lifecycle, SWR poll as
  fallback.

  `/audits/[id]` no longer polls every 3 s. The frontend opens an
  EventSource against `GET /api/audits/:publicId/events`, which streams
  `state` events as the worker transitions queued → running → done|
  failed and ends with an `end` event on terminal state. SWR remains
  mounted as a fallback channel: when EventSource is unsupported,
  errors before the first `state` event arrives, or the runtime is
  SSR, the page silently switches back to the same 3 s poll cadence
  that shipped in v1.0.0-rc.1.

  Backend:
  - `infrastructure/queue/auditEventsBus`: singleton over BullMQ
    `QueueEvents`. ONE Redis subscriber per api process feeds an
    in-memory `Map<publicId, Set<callback>>`, so a thousand concurrent
    SSE connections cost one subscriber, not a thousand. `start()` is
    idempotent and lazy; `stop()` is wired into the api graceful-
    shutdown path.
  - `interfaces/http/routes/auditEvents`: SSE handler with the standard
    headers (text/event-stream, no-cache, X-Accel-Buffering: no for
    nginx-style edges), an initial state push for clients that connect
    after the audit is already terminal, a 15 s heartbeat
    comment to defeat proxy idle timeouts, in-flight coalescing so a
    flurry of bus events doesn't stack DB reads, and explicit cleanup
    on `req.close`.

  Frontend:
  - `lib/useAuditStream`: hook that prefers the SSE-delivered state
    over SWR's, falls back gracefully on init error, and stops the
    SSE channel on unmount.
  - `AuditDetailView` switched from direct `useSWR` to the new hook.
    Behavior identical for happy path; users on browsers without
    EventSource get the prior poll experience.

  Tests: 7 backend bus tests (event dispatch, multi-subscriber, missing
  jobId, throwing subscriber, unsubscribe semantics, idempotent start,
  stop cleanup); 5 backend SSE handler tests (terminal-on-connect,
  not-found, transition stream, disconnect cleanup, heartbeat); 7
  frontend hook tests (open, prefer SSE state, end closes, fallback on
  init error, no-fallback on transient error, no-EventSource branch,
  unmount cleanup).

  Backend total 235 (was 223), frontend 108 (was 101). Coverage
  95.87 / 78.44 (lines / branches) — gates 80 / 75. Bundle budget
  unchanged within 1 KB on /audits/[id].

- bedb677: Phase 5.3 — Soft auth via magic link.
  - New routes (backend): `POST /api/auth/magic-link`, `GET /api/auth/verify`,
    `GET /api/auth/me`, `POST /api/auth/logout`. Plus a non-prod test hatch
    `GET /api/auth/__test/last-link?email=…` for e2e flows.
  - Anonymous flow (`X-Client-Id`) preserved unchanged. Audits scope by
    `userId` when the session cookie resolves and by `clientId` otherwise;
    POSTs from a signed-in caller record both so `mergeAnonymousAudits`
    can attach prior anonymous audits on first verify. The `clientId` is
    captured at `POST /magic-link` time (which carries `X-Client-Id` via
    `apiFetch`) and stored on the link, so the merge survives the
    email-link click — browsers do not propagate custom headers across
    email-driven navigation. The `/verify` header is kept as a defensive
    fallback for legacy in-flight links and non-browser callers.
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

- 61891ca: Security and platform bumps to clear the prod npm audit gate.
  - **backend**: `bullmq` 5.12.0 → 5.76.5 (drops vulnerable transitive
    `uuid` 11.0.x — GHSA-w5hq-g745-h8pq).
  - **frontend**: `next` 14.2.5 → 15.5.15 to inherit security backports
    for the multiple Next.js DoS / HTTP smuggling advisories filed
    against the 14.x line (GHSA-9g9p-9gw9-jx7f, GHSA-h25m-26qc-wcjf,
    GHSA-ggv3-7p47-pfv8, GHSA-3x4c-7xq6-9pq8, GHSA-q4gf-8mx6-v5v3).
    React + ReactDOM 18.3 → 19.2 follows because Next 15 dedupes on
    React 19 across its own peer-dep tree, leaving Jest with two
    incompatible React copies otherwise.
  - **root** (`overrides`): force `basic-ftp` ≥ 6.0.1 across the
    Puppeteer-Core transitive chain (GHSA-rp42-5vxx-qpwr).

  App Router page now consumes `params` as a Promise per Next 15's
  async-dynamic-API contract.

  `npm audit --omit=dev --audit-level=high` is now green for both
  workspaces.

### Patch Changes

- 74aca45: Restore backend branches-coverage gate (75 %) by adding tests for the
  holes that crept in since v0.5.0:
  - `infrastructure/metrics/queueDepth.ts` had no tests at all (0 / 0 / 0
    / 0). New unit tests cover happy-path sampling, missing-counts =
    zero coalescing, fail-closed-on-redis-error behavior, and the
    unref'd timer contract.
  - `interfaces/http/routes/audits.ts` was at 50 % branches: missing
    cases were the malformed-body path and the non-`UnsafeUrlError`
    failure from `assertSafeUrl`. Both now covered.
  - `interfaces/http/middlewares/clientIdRateLimit.ts` was at 50 %:
    missing case was the `req.clientId === undefined` defensive branch
    (when the route forgets to mount `requireClientId` first). Now
    covered.

  Global backend coverage moves from 91.17 / 63.93 to 99.15 / 80.32
  (lines / branches), back above the 80 / 75 gates with margin.

- de9768e: Override `postcss` and `tmp` to patched versions across the workspace,
  closing two open Dependabot vulnerability alerts on the public mirror's
  Security tab.
  - `postcss` → `^8.5.14` — closes GHSA-qx2v-qp2m-jg93 (medium): XSS via
    unescaped `</style>` in CSS Stringify Output. Reaches the bundle via
    `next` (both `frontend/next@15.x` and the storybook-vite `next@16.x`)
    which had not yet bumped their bundled postcss.
  - `tmp` → `^0.2.5` — closes GHSA-52f5-9888-hmc6 (low): symlink attack
    on the `dir` parameter. Reaches dev tooling via the
    `@stryker-mutator → @inquirer/editor → external-editor` chain.

  Both fixes via the existing `overrides` block (alongside the prior
  `basic-ftp` pin) rather than a `npm audit fix --force`, which would
  downgrade `next` to `9.3.3` and `@stryker-mutator/core` to a breaking
  major. Parents stay on their current versions; only the resolved
  transitive is forced up.

  After this change, `npm audit` no longer reports the postcss / tmp
  findings. Backend build and tests pass against the new lockfile.

- 104d4aa: Phase 4.4 — per-PR Railway preview environments via GitHub Action.

  `.github/workflows/preview-env.yml` creates `pr-<number>` envs cloned
  from production (or `RAILWAY_BASE_ENVIRONMENT`), deploys the PR
  branch, and comments the URL back on the PR. Closing the PR tears the
  env down.

  The workflow is **self-skipping** when secrets aren't set, so forks
  and fresh clones don't see permission errors. One-time setup is
  documented in [docs/preview-environments.md](docs/preview-environments.md):
  `RAILWAY_TOKEN`, `RAILWAY_PROJECT_ID`, and optional
  `RAILWAY_BASE_ENVIRONMENT` repo secrets.

  `railway.json` at repo root pins the build / deploy / restart-policy
  config so subsequent envs are reproducible.

  No application code touched.

- 0a4c875: Phase 5.4 — security hardening (small wins).
  - **gitleaks pre-commit hook** in `.husky/pre-commit`: catches secrets
    in staged changes before they leave the workstation. Falls through
    with a warning when gitleaks isn't on PATH so devs without it
    installed aren't blocked; CI still runs gitleaks on every push.
  - **`npm audit signatures` step** added to the security workflow:
    validates that every dependency in the lockfile carries a valid
    registry signature. Catches package-tampering / typosquats with
    forged manifests.
  - **Dedicated rate limit on `/api/rum`** (240/min per IP, returns 204
    on throttle). The global cap is sized for state-changing API calls;
    web-vitals fires 5 metrics per page load and a busy reader
    navigating ~6 pages in a minute would trip the global limit on
    beacons alone. RUM is non-state-changing, so a higher cap is safe;
    returning 204 on throttle keeps the sendBeacon contract quiet.

- c5f65b5: Add per-IP rate limit on `GET /api/auth/verify` to close a CodeQL
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
