# Runbook: DNS rebinding incident

A submitted URL is suspected of having pivoted from a public IP at
intake to a private IP at connect, attempting to read internal
resources via the worker.

## Symptoms

- `audit_failure_total{reason="ssrf"}` spike correlated with a single
  `clientId` or IP.
- Worker logs contain `unsafe_url:unsafe_target` events with the same
  hostname appearing repeatedly across hours.
- Security team or external researcher report.

## Diagnosis

1. **Identify the request id chain.** Pull the api log for the
   `requestId` of the suspected submission (frontend `X-Request-Id`
   header, response envelope's `requestId`, or the BullMQ job log).
2. **Resolve the hostname yourself** repeatedly with
   `dig +short <host>`. If results vary or include private ranges,
   it's rebinding.
3. **Confirm worker behavior.** The defense-in-depth chain
   (`assertSafeUrl` → `resolveSafeAddress` → subrequest interceptor)
   should have refused. If any layer accepted, that's the bug.

## Mitigation

- **Block the source.** Add the offending `clientId` to the rate-
  limiter Redis sorted set with a permanent deny (manual): `ZADD
rl:audits:submit:<clientId> 9999999999 deny`. Add the source IP to
  Cloudflare WAF.
- **Refuse the host.** Add the host to a deny-list in
  `urlSafety.ts` until the upstream resolver is trusted.

## Follow-up

- Postmortem must answer: _which layer let it through, if any?_ If
  none did and we caught it, document this as a successful test of
  the defenses.
- Consider raising the bar to full Chromium-level pinning
  (`--host-resolver-rules` + per-job browser) if rebinding becomes a
  pattern. Cost: lose the browser-reuse perf win.
- Add the failing payload as a test case under `urlSafety.test.ts` or
  `resolveSafeAddress.test.ts`.
