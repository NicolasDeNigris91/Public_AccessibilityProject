# Grafana dashboards

`euthus.json` is a Grafana dashboard covering the production
observability surface end-to-end: api RED, worker pipeline (USE),
DLQ, Real User Monitoring (Core Web Vitals), and a tracing pointer.

## Import

1. Grafana → Dashboards → New → **Import**.
2. Upload `euthus.json` (or paste its contents).
3. Pick your Prometheus datasource on the prompt — the file uses
   `${DS_PROM}` so the same JSON imports unchanged into any
   Grafana / datasource pair.
4. Save.

## What's inside

| Row                     | Panels                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| RED — API               | request rate, 5xx ratio (with SLO threshold), p50/p95/p99                                                               |
| Worker — audit pipeline | in-flight, queue depth by status, audit duration p50/p95/p99 (vs the 30s SLO), failures by reason, Puppeteer relaunches |
| DLQ                     | 24h moves by reason, 5m rate by reason                                                                                  |
| RUM (web-vitals)        | LCP / INP / CLS p75 per route (with the `good / needs improvement / poor` thresholds), beacons rejected                 |
| Tracing                 | Markdown pointer to the OTel setup + the canonical spans                                                                |

## When this isn't enough

The dashboard is a starting point: panels are sized to the metrics
the codebase exposes today (`backend/src/infrastructure/metrics/registry.ts`).
When you add a new metric, add the panel **here** in the same PR
so the dashboard stays in sync.

For SLO burn rates / multi-window alerts: see `docs/SLO.md` for the
intent and add an alert rule in Grafana directly — alerts are out of
scope for this committed JSON, since they almost always need
project-specific notification routing.
