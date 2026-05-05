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
