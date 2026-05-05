# Chaos drills

Manual scripts that inject the failure modes the system is supposed
to absorb. Run them against `docker-compose up --build` locally and
inspect the logs / metrics — the runbooks under `docs/runbooks/`
document what _should_ happen for each drill.

Each script assumes the standard service names from the repo's
`docker-compose.yml` (`mongo`, `redis`, `api`, `worker`). If you
rename services, edit the script.

| File                                     | What it injects                                          | Runbook                                                              |
| ---------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------- |
| [redis-kill.sh](./redis-kill.sh)         | `docker compose stop redis` for 30 s, then start         | [worker-stuck.md](../../docs/runbooks/worker-stuck.md)               |
| [mongo-restart.sh](./mongo-restart.sh)   | `docker compose restart mongo` mid-flight                | [rollback.md](../../docs/runbooks/rollback.md)                       |
| [worker-sigkill.sh](./worker-sigkill.sh) | `docker compose kill -s SIGKILL worker` while a job runs | [puppeteer-crashloop.md](../../docs/runbooks/puppeteer-crashloop.md) |

## What "passing" looks like

- **Redis kill**: `/ready` flips to 503 within ~5 s; existing API
  requests in flight complete; new audit submissions 503 (queue
  unreachable). When Redis returns: `/ready` recovers, queue
  resumes, in-flight jobs finish.
- **Mongo restart**: `/ready` flips to 503; in-flight audits move to
  `failed` with a Mongo-error message; queue keeps accepting (Redis
  is independent). When Mongo returns: `/ready` recovers, new audits
  succeed; the failed entries can be re-submitted from the dashboard.
- **Worker SIGKILL during a job**: BullMQ marks the job stalled,
  re-enqueues it on the next worker pickup (idempotent on `publicId`).
  The user-visible status flips back to `queued` then `running` when
  the next worker grabs it. After 2 attempts (the `attempts` setting),
  the job moves to the dead-letter queue.

## Why this isn't in CI

Docker-in-docker chaos drills work but are slow and noisy in GitHub
Actions runners. The smoke load test in
[`tests/load/smoke.k6.js`](../load/smoke.k6.js) covers the happy path
under load in CI; chaos drills are a manual exercise to run before
each release-candidate tag and after any infra change.
