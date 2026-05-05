---
"backend": minor
"frontend": minor
---

Phase 5.2 — Server-Sent Events for audit lifecycle, SWR poll as
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
