---
"backend": minor
---

Phase 4.2 — end-to-end OpenTelemetry tracing.

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
