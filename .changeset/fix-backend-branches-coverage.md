---
"backend": patch
---

Restore backend branches-coverage gate (75 %) by adding tests for the
holes that crept in since v0.5.0:

- `infrastructure/metrics/queueDepth.ts` had no tests at all (0 / 0 / 0
  / 0). New unit tests cover happy-path sampling, missing-counts =
  zero coalescing, fail-closed-on-redis-error behavior, and the
  unref'd timer contract.
- `interfaces/http/routes/audits.ts` was at 50 % branches: missing
  cases were the malformed-body path and the non-`UnsafeUrlError`
  failure from `assertSafeUrl`. Both now covered.
- `interfaces/http/middlewares/clientIdRateLimit.ts` was at 50 %:
  missing case was the `req.clientId === undefined` defensive branch
  (when the route forgets to mount `requireClientId` first). Now
  covered.

Global backend coverage moves from 91.17 / 63.93 to 99.15 / 80.32
(lines / branches), back above the 80 / 75 gates with margin.
