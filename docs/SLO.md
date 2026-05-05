# Euthus — Service Level Objectives

> Objectives are measurable promises about user-facing behavior. Internal
> metrics that don't drive a user decision live in the dashboard, not here.

The four SLOs below are tracked off the Prometheus series exposed by the
api at `/metrics` and the worker at `:9100/metrics`. Error budget is
calculated over a rolling 30-day window. When 50% of a budget is burned
in less than 24 h, the on-call is paged; when 100% is burned, non-critical
deploys to that surface freeze until the next window starts.

## Audit duration (worker)

- **SLO:** p95 of `audit_duration_seconds` ≤ **30 s** for URLs ≤ 2 MB.
- **Why:** Anything above 30 s and the user assumes the page never loaded.
- **Source series:** `histogram_quantile(0.95, sum by (le) (rate(audit_duration_seconds_bucket[5m])))`
- **Error budget:** 5% of audits per 30 d may exceed 30 s.

## API availability

- **SLO:** `/api/audits` returns a 5xx in **≤ 0.5%** of requests (rolling 30 d).
- **Source series:**
  `sum(rate(http_request_duration_seconds_count{route=~"/api/.*",status_class="5xx"}[5m]))`
  `/ sum(rate(http_request_duration_seconds_count{route=~"/api/.*"}[5m]))`
- **Error budget:** 99.5% successful, i.e. ≈ 3 h 30 min of 5xx-tolerant
  time per month.

## Audit failure rate

- **SLO:** `audit_failure_total{reason!="ssrf"}` over `audits_enqueued_total`
  stays **≤ 5%** rolling 30 d. SSRF rejections are excluded — those are
  the system working as intended.
- **Why:** Above 5%, our scoring is misleading because half the URLs
  never finished. Below 1% is realistic for the open web.
- **Error budget:** 5% of submitted audits per 30 d may end in `failed`
  status without an SSRF reason.

## Queue lag (intake → pickup)

- **SLO:** p95 wait time `audits_enqueued - audit_in_flight_started`
  ≤ **60 s**. Today this is approximated by `audit_queue_depth{status="wait"}`
  staying below `MAX_CONCURRENT_AUDITS × 5`. Replace with a histogram
  derived from BullMQ events when OpenTelemetry tracing lands (Phase 2.5+).
- **Why:** A user submitting a URL should see _running_ on the dashboard
  within a minute even when the queue is busy.
- **Error budget:** 5% of audits per 30 d may sit > 60 s waiting.

## Reading the budget

If a runbook ever needs you to _check_ the budget mid-incident, that is
the correct moment to look at Grafana and the `audit_*` series, not at
this document. This file describes intent. The dashboard describes
reality.
