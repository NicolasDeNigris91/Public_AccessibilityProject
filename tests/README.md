# Tests outside the unit / integration suites

Three layers of tests that don't fit Jest:

| Folder             | Purpose                                                                                                                  | When                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| [load/](./load/)   | k6 smoke that exercises the full happy path under low load and asserts the SLOs from `docs/SLO.md` as inline thresholds. | Weekly + manual via `Load smoke (k6)` workflow; `npm run smoke:load` locally.                                            |
| [chaos/](./chaos/) | Manual shell drills that inject Redis kill, Mongo restart, worker SIGKILL against `docker compose`.                      | Before each release-candidate tag and after any infra change. Outcome documented in [docs/runbooks/](../docs/runbooks/). |

Unit and integration tests live with the workspace they exercise:
`backend/src/**/*.test.ts`, `frontend/src/**/*.test.{ts,tsx}`. The
Playwright e2e is at `frontend/e2e/`.
