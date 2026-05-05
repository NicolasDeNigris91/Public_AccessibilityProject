# Runbook: queue overflow

`audit_queue_depth{status="wait"}` is climbing without bound and the
intake → running latency is past the SLO.

## Symptoms

- Grafana queue panel red.
- Dashboard users report submissions sitting in `queued` for minutes.
- `audits_enqueued_total` rate >> `audit_duration_seconds_count` rate.

## Diagnosis

1. **Capacity vs demand.** Compute desired worker count =
   `enqueue_rate × p95_audit_duration / MAX_CONCURRENT_AUDITS`. If
   actual workers < desired, that's the cause.
2. **Stuck workers.** If actual workers ≥ desired but queue still
   grows, run _worker-stuck_ runbook on each worker.
3. **Abuse.** Check `audits_enqueued_total` by minute. A single
   `clientId` driving the rate now hits the per-client rate limit
   (30 / hour) — but legacy spikes from before this limit are possible
   for the next 30 days.

## Mitigation

- **Scale workers up.** Each worker costs ≈ 1 CPU + 512 MiB. On
  Railway: bump replicas in the worker service settings.
- **Drop low-priority jobs.** If demand is from a bot, identify the IP
  via `X-Forwarded-For` in api logs (correlated by `requestId`) and
  add to the rate-limiter denylist (future feature) or block at
  Cloudflare.
- **Pause intake.** Last resort: set `MAX_CONCURRENT_AUDITS=0` on api
  via env var update — POSTs still 202 but sit forever. Better: return
  503 from the rate-limit middleware while the queue drains.

## Follow-up

- File a capacity ticket if the spike was organic growth, not abuse.
- If the cause was abuse, postmortem should propose a per-IP-per-day
  cap on top of the per-clientId-per-hour cap.
