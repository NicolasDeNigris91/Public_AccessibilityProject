---
"backend": minor
"frontend": minor
---

Phase 5.1 — Real User Monitoring via Core Web Vitals.

The frontend now ships a tiny `<RumTracker />` mounted in the root
layout that listens for LCP / INP / FCP / TTFB / CLS via the
`web-vitals` library and beacons each metric to `POST /api/rum` on
the backend. `navigator.sendBeacon` is preferred (rides the
page-unload phase reliably); fetch + `keepalive` is the fallback.

Backend exposes one Prometheus histogram per metric (web*vital*\*\_seconds
plus the unitless `web_vital_cls`) with `route` labels constrained to
the documented page routes — no per-audit-id explosion. Buckets are
sized to the Web Vitals "good / needs improvement / poor" thresholds
so dashboards can colour the bars natively.

The dispatcher rejects unknown names, unknown routes, and out-of-range
values, counting each in `web_vital_rejected_total{reason}`. The
endpoint always 204s (a beacon is fire-and-forget; surfacing 4xx on
sendBeacon would just confuse devtools logs).

Tracker is **production-only** so `npm run dev` doesn't spam the
metric backend.

Tests: 28 backend (rumDispatch + rum route) and 17 frontend (rum
helper + route classifier). Total backend 223 / frontend 101.
Coverage 98.31 / 82.82 (backend) and 84.51 / 59.81 (frontend), all
above gates. Bundle budget unchanged within 1 KB on each route.
