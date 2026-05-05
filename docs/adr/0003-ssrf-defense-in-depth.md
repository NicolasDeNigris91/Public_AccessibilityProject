# ADR 0003 — SSRF defense in depth, not full Chromium-level pinning

- **Status:** Accepted
- **Date:** 2026-05-04
- **Decision-maker:** Nicolas

## Context

The worker opens user-supplied URLs in a real browser. The hardening
spectrum runs from "validate at intake and trust the OS resolver" to
"launch a fresh browser per job with `--host-resolver-rules` pinning
the resolved IP". The latter is the only way to fully close the DNS
rebinding window.

## Decision

Defense in depth, **without** per-job browser relaunch:

1. `domain/urlSafety` — pure IP classifier (public unicast only).
2. `application/assertSafeUrl` — DNS resolve + classify at intake.
3. `application/resolveSafeAddress` — DNS resolve + classify again
   immediately before navigation (catches resolver flips since intake).
4. `application/subrequestPolicy` + Puppeteer request interceptor —
   classify every subrequest; aborts redirects to literal private IPs.

We do **not** relaunch the browser per job to pass
`--host-resolver-rules=MAP <host> <ip>`.

## Consequences

- A residual rebinding window exists between layer (3) above and the
  TCP connect inside Chromium. The window is small (one DNS lookup);
  the attack surface is "the resolver flips the answer between two
  calls a millisecond apart". Detectable in logs (the pinned IP is
  recorded; mismatched connect can be diagnosed post-incident).
- We keep browser-reuse, which is a measurable performance win — first
  job still pays a launch (~2s), every subsequent job reuses the
  process.
- If rebinding becomes an observed attack pattern in production, ADR
  0003-bis can supersede this and accept the cost. Until then this is
  the right cost/risk balance for this app.
- The four-layer chain is independently unit-tested. See
  `domain/urlSafety.test.ts`, `application/assertSafeUrl.test.ts`,
  `application/resolveSafeAddress.test.ts`,
  `application/subrequestPolicy.test.ts`.
