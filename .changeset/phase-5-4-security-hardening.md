---
"backend": patch
---

Phase 5.4 — security hardening (small wins).

- **gitleaks pre-commit hook** in `.husky/pre-commit`: catches secrets
  in staged changes before they leave the workstation. Falls through
  with a warning when gitleaks isn't on PATH so devs without it
  installed aren't blocked; CI still runs gitleaks on every push.
- **`npm audit signatures` step** added to the security workflow:
  validates that every dependency in the lockfile carries a valid
  registry signature. Catches package-tampering / typosquats with
  forged manifests.
- **Dedicated rate limit on `/api/rum`** (240/min per IP, returns 204
  on throttle). The global cap is sized for state-changing API calls;
  web-vitals fires 5 metrics per page load and a busy reader
  navigating ~6 pages in a minute would trip the global limit on
  beacons alone. RUM is non-state-changing, so a higher cap is safe;
  returning 204 on throttle keeps the sendBeacon contract quiet.
