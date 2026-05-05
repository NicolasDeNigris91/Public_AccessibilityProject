# Runbook: puppeteer crashloop

`puppeteer_browser_relaunch_total` is ticking faster than once per
minute and audit failures all carry `reason="browser_crash"`.

## Symptoms

- Grafana: `rate(puppeteer_browser_relaunch_total[5m])` > 1/min.
- `audit_failure_total{reason="browser_crash"}` climbing.
- Worker logs: repeated `puppeteer disconnected, will relaunch on next job`.

## Diagnosis

1. **Memory.** `kubectl top` / Railway metrics on the worker container.
   Chromium leaks memory under sustained load; if RSS is at 90%+ of
   limit, the OS is killing it.
2. **Specific URL.** Tail `worker-stuck`'s last 50 jobs. If one URL
   appears multiple times in `audit job failed` log lines, that page
   is the trigger.
3. **Image regression.** Check the puppeteer base image tag in
   `backend/Dockerfile.worker`. Recent Chromium upgrades occasionally
   ship CRDP regressions.

## Mitigation

- **Restart worker** to recover the in-process Chromium handle.
- **Bump worker memory limit** if the cause is memory exhaustion.
- **Pin the puppeteer image** to the last known-good tag in
  `backend/Dockerfile.worker` and redeploy.
- **Quarantine the trigger URL** if found: surface it from the audit
  logs into the abuse list (future feature) or block at the SSRF
  guard with a custom reason.

## Follow-up

- File an issue against Puppeteer if the regression matches a known
  upstream report.
- Add a unit test for the trigger URL pattern under
  `subrequestPolicy.test.ts` if the cause was a request that should
  have been blocked but wasn't.
