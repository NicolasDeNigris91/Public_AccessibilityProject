---
"backend": minor
"frontend": minor
---

Security and platform bumps to clear the prod npm audit gate.

- **backend**: `bullmq` 5.12.0 → 5.76.5 (drops vulnerable transitive
  `uuid` 11.0.x — GHSA-w5hq-g745-h8pq).
- **frontend**: `next` 14.2.5 → 15.5.15 to inherit security backports
  for the multiple Next.js DoS / HTTP smuggling advisories filed
  against the 14.x line (GHSA-9g9p-9gw9-jx7f, GHSA-h25m-26qc-wcjf,
  GHSA-ggv3-7p47-pfv8, GHSA-3x4c-7xq6-9pq8, GHSA-q4gf-8mx6-v5v3).
  React + ReactDOM 18.3 → 19.2 follows because Next 15 dedupes on
  React 19 across its own peer-dep tree, leaving Jest with two
  incompatible React copies otherwise.
- **root** (`overrides`): force `basic-ftp` ≥ 6.0.1 across the
  Puppeteer-Core transitive chain (GHSA-rp42-5vxx-qpwr).

App Router page now consumes `params` as a Promise per Next 15's
async-dynamic-API contract.

`npm audit --omit=dev --audit-level=high` is now green for both
workspaces.
