---
"backend": minor
"frontend": minor
---

Phase 3 — performance + polish foundation:

- Worker isolates each audit in its own Puppeteer `BrowserContext`, with a
  warmup at boot to remove the first-job cold start.
- Repository now uses `@changesets/cli` for versioning and changelog. Every
  PR to `main` must ship a changeset (label `skip-changeset` to bypass for
  pure docs / CI changes).
