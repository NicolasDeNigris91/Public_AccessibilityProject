# Runbook: dead-letter queue replay

`audit_dead_letter_total` is climbing. Audits are exhausting their retry
budget and ending up in the `audits-dead` queue without anyone looking
at them.

## Symptoms

- Grafana DLQ panel red, or `rate(audit_dead_letter_total[1h]) > 0` for
  more than the usual baseline.
- Operator reports: a customer's audit shows `failed` in the dashboard
  but never gets retried.
- Bull-Board `/admin/queues` shows entries piling up under `audits-dead`.

## Diagnosis

1. **Open the admin UI.** `https://<api-host>/admin/queues` (basic auth,
   `ADMIN_USER` / `ADMIN_PASS`). The `audits-dead` queue lists each
   moved job with the original `publicId`, `url`, `errorMessage`,
   `failedAt`, and `attemptsMade`.
2. **Group by reason.** Click into a few entries. The DLQ counter is
   labelled by `reason` (timeout / network / ssrf / browser_crash /
   other). One label dominating means a class of failures, not a
   one-off.
   - `timeout` → see _puppeteer-crashloop_ runbook (long pages or hung
     network).
   - `network` → likely a flaky upstream; usually self-heals.
   - `ssrf` → a malicious target is repeatedly being submitted; check
     intake logs by `requestId` and consider blocking the source IP.
   - `browser_crash` → see _puppeteer-crashloop_ runbook (Chromium OOM
     or GPU sandbox).
   - `other` → look at `errorMessage` directly. If unfamiliar, that's
     a new failure mode worth a postmortem.

## Mitigation: replay one job

If the failure was transient (e.g. the target was down for a minute),
re-enqueue onto the live queue:

1. In Bull-Board → `audits-dead` → open the job → copy the `publicId`
   and `url` from the data tab.
2. POST a fresh audit:
   ```sh
   curl -X POST https://<api-host>/api/audits \
     -H "X-Client-Id: <re-issued-uuid>" \
     -H "Content-Type: application/json" \
     -d '{"url":"<original-url>"}'
   ```
   That returns a new `publicId`. The old DLQ entry stays for forensic
   reference; remove it manually from Bull-Board once the replay
   succeeds.

## Mitigation: bulk drain

If a class of failures has been resolved upstream and you want to
replay a batch:

1. In Bull-Board → `audits-dead` → filter / multi-select.
2. For each, take the `url` from `data.url` and POST it as above.
   (Do this from a script if there are many; the per-clientId rate
   limit is 30 / hour, so use a fresh UUID per batch.)

There is intentionally **no one-click "promote to live queue" button** —
auto-replay would re-enter the same SSRF / loop / crash scenarios that
sent the job here in the first place, with no human in the loop.

## Mitigation: clear the DLQ

When the queue contains nothing but old, triaged entries:

1. In Bull-Board → `audits-dead` → "Clean" → choose "completed +
   failed" with an age threshold (e.g. `older than 7 days`).
2. The retention default is 30 days; entries past that age are
   removed by BullMQ on the next sample.

## Follow-up

- If a single label crosses 5 % of total submitted audits over 24 h:
  open a postmortem. The system is failing in a way users notice.
- If a `browser_crash` baseline shifts upward after a Chromium update,
  pin the Puppeteer version and reopen the upgrade with a soak test.
- If `ssrf` rejections appear in DLQ at all, that's a bug — the SSRF
  policy is supposed to reject at intake (400) and never enqueue. File
  an incident.
