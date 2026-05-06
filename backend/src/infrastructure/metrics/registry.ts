import { Registry, collectDefaultMetrics, Counter, Histogram, Gauge } from "prom-client";

/**
 * Prometheus registry shared by api and worker. Keeping a single registry
 * per process means /metrics returns one cohesive scrape body.
 *
 * Naming follows the Prometheus conventions: snake_case, base unit suffix
 * (`_seconds`, `_bytes`, `_total`). Labels are bounded — never label by
 * raw URL or per-client id, those become high-cardinality time series.
 */

export const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: "node_" });

export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests served by the api, by route + method + status class",
  labelNames: ["route", "method", "status_class"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const auditsEnqueuedTotal = new Counter({
  name: "audits_enqueued_total",
  help: "Total accessibility audit jobs accepted by POST /api/audits",
  registers: [registry],
});

export const auditDurationSeconds = new Histogram({
  name: "audit_duration_seconds",
  help: "End-to-end duration of a single audit job from worker pickup to persisted result",
  buckets: [1, 2.5, 5, 10, 20, 30, 45, 60, 90, 120],
  registers: [registry],
});

export const auditFailureTotal = new Counter({
  name: "audit_failure_total",
  help: "Audit jobs that ended in 'failed' status, by error category",
  labelNames: ["reason"],
  registers: [registry],
});

export const puppeteerBrowserRelaunchTotal = new Counter({
  name: "puppeteer_browser_relaunch_total",
  help: "Number of times the worker had to relaunch its Puppeteer browser",
  registers: [registry],
});

export const auditsInFlight = new Gauge({
  name: "audits_in_flight",
  help: "Audit jobs currently being processed by this worker",
  registers: [registry],
});

export const auditQueueDepth = new Gauge({
  name: "audit_queue_depth",
  help: "Pending audit jobs in the queue, by status",
  labelNames: ["status"], // wait | active | delayed | failed
  registers: [registry],
});

export const auditDeadLetterTotal = new Counter({
  name: "audit_dead_letter_total",
  help: "Audit jobs that exhausted attempts and were moved to the dead-letter queue, by error category",
  labelNames: ["reason"],
  registers: [registry],
});

/**
 * Real User Monitoring — Core Web Vitals reported by the frontend.
 * Each metric has its own histogram with buckets sized to the
 * Web Vitals "good / needs improvement / poor" thresholds. Route is
 * the page route (e.g. "/", "/app", "/audits/[id]"); never the URL
 * with parameters baked in (cardinality control).
 */
export const webVitalLcpSeconds = new Histogram({
  name: "web_vital_lcp_seconds",
  help: "Largest Contentful Paint reported by web-vitals on the client",
  labelNames: ["route"],
  // Web Vitals: good <=2.5s, needs improvement 2.5-4s, poor >4s.
  buckets: [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10],
  registers: [registry],
});

export const webVitalInpSeconds = new Histogram({
  name: "web_vital_inp_seconds",
  help: "Interaction to Next Paint reported by web-vitals on the client",
  labelNames: ["route"],
  // Web Vitals: good <=200ms, needs improvement 200-500ms, poor >500ms.
  buckets: [0.05, 0.1, 0.15, 0.2, 0.3, 0.5, 0.75, 1, 1.5, 3],
  registers: [registry],
});

export const webVitalFcpSeconds = new Histogram({
  name: "web_vital_fcp_seconds",
  help: "First Contentful Paint reported by web-vitals on the client",
  labelNames: ["route"],
  buckets: [0.25, 0.5, 1, 1.5, 1.8, 2.5, 3, 4, 5, 7.5],
  registers: [registry],
});

export const webVitalTtfbSeconds = new Histogram({
  name: "web_vital_ttfb_seconds",
  help: "Time to First Byte reported by web-vitals on the client",
  labelNames: ["route"],
  buckets: [0.05, 0.1, 0.2, 0.4, 0.6, 0.8, 1, 1.5, 2, 3],
  registers: [registry],
});

export const webVitalCls = new Histogram({
  name: "web_vital_cls",
  help: "Cumulative Layout Shift reported by web-vitals on the client (unitless)",
  labelNames: ["route"],
  // CLS is unitless; good <=0.1, needs improvement 0.1-0.25, poor >0.25.
  buckets: [0.01, 0.025, 0.05, 0.1, 0.15, 0.25, 0.5, 1],
  registers: [registry],
});

export const webVitalRejectedTotal = new Counter({
  name: "web_vital_rejected_total",
  help: "RUM beacons rejected at the api boundary, by reason",
  labelNames: ["reason"], // shape | route | name | value
  registers: [registry],
});

/**
 * Soft-auth: anonymous → user audit migration on magic-link verify.
 * Outcome label is bounded to the three known states. clientId and
 * userId are deliberately NOT labels — they go in structured logs
 * where high cardinality is fine, never as Prometheus series.
 */
export const authAnonymousAuditsMergeTotal = new Counter({
  name: "auth_anonymous_audits_merge_total",
  help: "Anonymous to user audit merge attempts on magic-link verify, by outcome",
  labelNames: ["outcome"], // merged | no_match | skipped
  registers: [registry],
});

export const authAnonymousAuditsMovedTotal = new Counter({
  name: "auth_anonymous_audits_moved_total",
  help: "Cumulative anonymous audits successfully attached to a user across verifies",
  registers: [registry],
});

/**
 * Outbound email circuit breaker. The label set is the closed
 * three-state machine (closed | half_open | open) plus a synthetic
 * `rejected` event recorded every time a call is fast-failed during
 * the cooldown — useful for distinguishing "provider was down" from
 * "we're protecting it" in postmortems.
 */
export const authEmailCircuitBreakerEventsTotal = new Counter({
  name: "auth_email_circuit_events_total",
  help: "Outbound email circuit breaker events (transitions + rejected calls during cooldown)",
  labelNames: ["event"], // closed | half_open | open | rejected
  registers: [registry],
});
