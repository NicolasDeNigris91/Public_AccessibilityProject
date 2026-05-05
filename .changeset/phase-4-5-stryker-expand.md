---
"backend": minor
---

Phase 4.5 — expand Stryker mutation testing surface beyond `domain/` to
include the `application/` and `interfaces/http/` layers.

- `stryker.config.json` mutate glob now also includes
  `application/{assertSafeUrl,resolveSafeAddress,subrequestPolicy}.ts`,
  the four `interfaces/http/middlewares/*` files, and
  `interfaces/http/routes/audits.ts`.
- Mutation workflow watches changes under `application/` and
  `interfaces/http/` too, with `timeout-minutes` raised to 30 to
  accommodate the bigger surface (was 15).
- Global break threshold stays at 70 % (current score: 77.08 %).
  application/ is at 79.59 % — within striking distance of the 80 %
  goal called out in the QUALITY-AUDIT plan.
- Two integration tests added to kill mutants surviving on
  `routes/audits.ts`: explicit newest-first sort assertion (with three
  docs in reverse-chronological insertion order so a missing
  `.sort({ createdAt: -1 })` is detectable) and an exact key-set
  assertion on the list response.
- One unit test added on `assertSafeUrl` covering an IPv6-bracketed
  hostname so the `^\[|\]$/g` strip is exercised.

The new tests revealed a real leak in the audit routes: both
`GET /api/audits` and `GET /api/audits/:publicId` were returning
Mongo's `_id` (and on the detail endpoint, `__v`, `clientId`,
`updatedAt`) along with the documented contract. The route handlers
now `.select(...)` the documented fields explicitly with `-_id`,
matching the long-standing comment in `domain/contracts.ts`. A new
integration test guards each side against future regressions.

Coverage and tests: 161 unit tests pass (+3 vs fix branch); coverage
99.15 / 80.32 (lines / branches), well above the 80 / 75 gates.
