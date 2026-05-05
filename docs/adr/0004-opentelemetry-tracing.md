# ADR 0004 — End-to-end tracing via OpenTelemetry, OTLP/HTTP only

- **Status:** Accepted
- **Date:** 2026-05-05
- **Decision-maker:** Nicolas

## Context

`requestId` propagation links logs across api → BullMQ → worker, but a
single submission is still a tree of spans we can't see: how much of
the latency is express, how much is mongo, how much is the page load,
how much is axe injection. Phase 4.2 of QUALITY-AUDIT calls for
distributed tracing end-to-end.

OTel has a sprawling surface: SDKs in 10 languages, multiple wire
formats (OTLP/HTTP, OTLP/gRPC, Jaeger, Zipkin), and instrumentation
libraries for everything. The decision space is "which subset do we
take on, today, for an app that fits on a single Railway project."

## Decision

1. **`@opentelemetry/sdk-node` with `@opentelemetry/auto-
instrumentations-node`** — http, express, mongoose, ioredis are
   instrumented automatically by importing a single bundle. fs is
   disabled (noisy, low signal). The `/health`, `/ready`, `/metrics`
   probes are filtered (no diagnostic value, k8s probes spam them).
2. **OTLP/HTTP exporter only.** Avoids the gRPC dep weight; all the
   relevant backends (Tempo Cloud, Jaeger, Honeycomb, AWS X-Ray
   adapter) accept OTLP/HTTP. One protocol is one less thing to debug.
3. **No-op by default.** When `OTEL_EXPORTER_OTLP_ENDPOINT` is unset,
   the SDK is **never started**. Local dev and CI run with zero OTel
   overhead and no error if no collector is up.
4. **Manual spans only on the queue boundary.** `audit.enqueue` on the
   producer side, `audit.process` on the consumer side, `audit.run`
   inside the worker. The trace context (W3C `traceparent`) rides on
   the BullMQ payload — there is no auto-instrumentation for BullMQ.
5. **Default destination intent: Grafana Tempo Cloud.** The free tier
   tier (50GB/30d) covers anything this project is likely to generate
   for the foreseeable future. Routing to a different OTLP/HTTP backend
   is a single env-var change.

## Consequences

- The api and worker entry points each begin with a tiny `instrumentation*.ts`
  preamble that calls `startTelemetry`. **The preamble must be the
  first import** so the SDK registers its hooks before express /
  mongoose / ioredis are loaded. Anyone editing `server.ts` or
  `auditWorker.ts` needs to keep that import at the top.
- Producer / consumer span linking is manual: the audit route captures
  the W3C `traceparent`, attaches it to `AuditJobData`, and the worker
  re-enters that context before starting `audit.process`. If a future
  refactor changes the queue payload shape, both ends need to update
  together.
- We do not export metrics or logs through OTel — Prometheus
  (`/metrics`) and pino (stdout) stay the source of truth for those.
  Adding OTel metrics later is straightforward (the SDK supports it)
  but unnecessary today.
- Span attribute cardinality is bounded: `audit.url_host` (the
  hostname only, never the full URL) and `audit.public_id`. URLs and
  IDs would explode the trace backend's index without giving us
  anything we can't get from logs.
