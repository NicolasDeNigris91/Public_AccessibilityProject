---
"backend": minor
---

Phase 4.3 — explicit dead-letter queue + Bull-Board admin UI.

**Dead-letter queue.** Audit jobs that exhaust all attempts now move to
a separate `audits-dead` BullMQ queue rather than rotting on the live
queue's `failed` set. The DLQ payload carries the original
`AuditJobData` plus `failedAt`, `errorMessage`, `attemptsMade`. The
move is **idempotent** (`jobId = dead:<publicId>`) and **defensive**
(any error from the deadQueue write is logged and swallowed so the
worker can never crash because the DLQ is misconfigured).

The move logic is a pure function (`moveToDeadLetterIfFinal`) wired
from `auditWorker.on("failed", ...)` so the policy is unit-tested
without Redis or BullMQ — 8 tests cover happy path, retry-still-
pending skip, idempotency, single-attempt jobs, error-class
classification, redis-down resilience, and BullMQ edge cases.

**Metric.** New counter `audit_dead_letter_total{reason}` exposed on
both the api and worker `/metrics` endpoints. `reason` is the same
low-cardinality bucket already used by `audit_failure_total`
(`timeout` / `network` / `ssrf` / `browser_crash` / `other`).

**Bull-Board UI.** Mounted at `/admin/queues` showing both the live
`audits` queue and the new `audits-dead` queue, behind HTTP basic auth.
The `basicAuth` middleware compares creds with `crypto.timingSafeEqual`
on padded buffers (length-equality also checked) so neither the right
answer nor the secret length leaks through timing. The admin route is
**only mounted when both `ADMIN_USER` and `ADMIN_PASS` env vars are
set** — a forgotten env in prod cannot accidentally serve the UI
without authentication. 7 integration tests cover the env gate, both
auth failure paths, the success path, and queue registration.

**Runbook.** `docs/runbooks/dlq-replay.md` documents the diagnosis →
mitigation → follow-up flow for "DLQ is filling up", with explicit
guidance against an auto-replay button (jobs are in the DLQ for a
reason; a human must triage).

185 unit tests pass (was 161); coverage 99.29 / 84.00 (lines /
branches), well above the 80 / 75 gates.
