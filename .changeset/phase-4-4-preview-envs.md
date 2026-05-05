---
"backend": patch
"frontend": patch
---

Phase 4.4 — per-PR Railway preview environments via GitHub Action.

`.github/workflows/preview-env.yml` creates `pr-<number>` envs cloned
from production (or `RAILWAY_BASE_ENVIRONMENT`), deploys the PR
branch, and comments the URL back on the PR. Closing the PR tears the
env down.

The workflow is **self-skipping** when secrets aren't set, so forks
and fresh clones don't see permission errors. One-time setup is
documented in [docs/preview-environments.md](docs/preview-environments.md):
`RAILWAY_TOKEN`, `RAILWAY_PROJECT_ID`, and optional
`RAILWAY_BASE_ENVIRONMENT` repo secrets.

`railway.json` at repo root pins the build / deploy / restart-policy
config so subsequent envs are reproducible.

No application code touched.
