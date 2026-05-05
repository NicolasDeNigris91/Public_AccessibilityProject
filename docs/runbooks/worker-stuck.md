# Runbook: worker stuck

The worker is alive (`/healthz` 200) but jobs sit in `active` forever and
no `audit_duration_seconds_count` increments.

## Symptoms

- Grafana: `audits_in_flight` flat at 1+ for > 5 min.
- `audit_queue_depth{status="wait"}` climbing.
- Dashboard shows audits stuck in `running` past `AUDIT_TIMEOUT_MS + 60s`.

## Diagnosis

1. Check the worker's recent logs for `puppeteer disconnected` or
   `blocked unsafe subrequest` storms. A single hostile site can stall
   one worker thread.
2. Hit `:9100/metrics` and look at:
   - `puppeteer_browser_relaunch_total` — if it's ticking, Chromium is
     crashing repeatedly. Move to runbook _puppeteer-crashloop_.
   - `audits_in_flight` — if it's ≥ `MAX_CONCURRENT_AUDITS`, every slot
     is occupied. Could be slow targets, not a bug.
3. `redis-cli LLEN bull:audits:wait` against the production Redis to
   confirm queue depth from the source.

## Mitigation

- **Drain and restart the worker** (preferred). SIGTERM gives 25 s to
  finish whatever finishes; force-close otherwise. BullMQ re-queues
  any jobs whose lock expires. Capacity is restored within ~2 min.
- **Cancel a specific stuck job:** `BullMQ` does not have a direct
  cancel; flip the audit document to `failed` in Mongo and remove the
  job by id from the `bull:audits:active` Redis list. The user will see
  a "failed" badge and can re-audit.
- **Lower `MAX_CONCURRENT_AUDITS`** temporarily if Chromium memory
  pressure is the cause.

## Follow-up

- If the same URL stalls multiple times, add it to the abuse list
  (future feature) or note it in the postmortem.
- Review `audit_failure_total{reason="timeout"}` for the previous hour;
  recurring spikes mean the timeout is too tight or the target market
  shifted.
