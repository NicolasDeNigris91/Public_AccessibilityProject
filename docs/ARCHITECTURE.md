# Notes on the design

A few notes on how this is put together, mostly for my own future self.

## Data flow

```
   Browser (Next.js dashboard)
        |
        |  1. POST /api/audits {url}
        v
   +--------------+    2. validate (zod) + create Audit{status:"queued"}
   |   API (Node) | -----> MongoDB
   |   Express    |    3. enqueue {publicId, url}
   +------+-------+ -----> Redis (BullMQ)
          |
          |  202 {publicId}
          v
   Browser polls GET /api/audits/:id
          ^
          |                          Worker (separate process)
          |                          - puppeteer.launch (reused across jobs)
          |                          - page.goto(url) + inject axe-core
          |                          - axe.run() -> violations
          |                          - screenshot per violation node
          |
          |   8. update Audit{status:"done", score, totals, violations[]}
          +------------------------> MongoDB
```

## Two processes, two images

`api` (`backend/Dockerfile`) is a slim Node image with no Chromium — the API
never launches a browser. `worker` (`backend/Dockerfile.worker`) is built on
the official `puppeteer/puppeteer` image, which ships its own Chrome and a
non-root `pptruser`. Splitting the images keeps the API surface small (no
chromium binaries on the public-facing container) and lets the two scale
independently.

## Folders

I went with a clean-architecture layout because I wanted `domain/` to stay pure
(no Mongo, no Redis, no Chromium) so I could unit-test scoring and the URL
classifier without booting anything. If I ever swap Puppeteer for Playwright or
BullMQ for SQS, only `infrastructure/` should move.

## Things that can go wrong, and what catches them

- Puppeteer crashes: a `disconnected` listener nulls the cached browser; the
  next job relaunches it.
- Page hangs: `AUDIT_TIMEOUT_MS` on `page.goto`.
- Worker dies mid-job: BullMQ's visibility timeout re-queues the job.
- Redeploy mid-job: `SIGTERM` drains in-flight jobs, then force-closes after
  25s and lets BullMQ re-queue whatever did not finish.
- Mongo or Redis briefly down at boot: `/ready` flips to `degraded` so the
  load balancer stops routing, but `/health` stays 200 so the orchestrator
  does not restart the container in a loop.

## Auth

There is no login. Every browser mints a UUID on first load and sends it as
`X-Client-Id`. That header scopes the "my audits" list. Audit reports
themselves are public by `publicId` (a UUID) so they can be shared by URL.

If this ever needs real accounts, that header gets replaced by a session and
nothing else changes.

## Error envelope

```json
{
  "error": { "code": "unsafe_target", "message": "unsafe_target" },
  "requestId": "0b4d2f1e-..."
}
```

`requestId` is set by middleware, returned in `X-Request-Id`, propagated into
the BullMQ job, and attached to every log line the worker emits. With one id
you get the full HTTP-to-worker trail.

## SSRF

The worker opens user-supplied URLs in a real browser, so there are three
guards in front of `page.goto`:

1. `domain/urlSafety` only allows public unicast IPs.
2. `application/assertSafeUrl` resolves DNS at intake.
3. The worker re-checks before navigation and a Puppeteer request interceptor
   aborts any sub-request whose hostname is a literal private IP.
