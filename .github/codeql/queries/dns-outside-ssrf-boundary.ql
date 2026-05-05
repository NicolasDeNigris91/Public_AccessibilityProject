/**
 * @name DNS resolution outside the SSRF policy boundary
 * @description Direct DNS resolution should only happen inside the two
 *              dedicated SSRF-policy modules (`assertSafeUrl.ts` and
 *              `resolveSafeAddress.ts`) where the IP-classification
 *              guard is enforced. A `dns.lookup` / `dns.resolve*`
 *              call anywhere else risks bypassing the SSRF defense
 *              described in ADR 0003.
 * @kind problem
 * @problem.severity warning
 * @security-severity 7.5
 * @id euthus/dns-outside-ssrf-boundary
 * @tags security
 *       external/cwe/cwe-918
 */

import javascript

/**
 * Names exported by `node:dns` (and `dns/promises`) that perform a
 * resolution and could be used to reach a target IP. Anything else
 * (e.g. `dns.getServers`) is read-only metadata and not part of the
 * resolution path the SSRF policy guards.
 */
predicate isResolutionMember(string name) {
  name = "lookup" or
  name = "resolve" or
  name = "resolve4" or
  name = "resolve6" or
  name = "resolveAny" or
  name = "resolveCname" or
  name = "resolveMx" or
  name = "resolveNs" or
  name = "resolvePtr" or
  name = "resolveSrv" or
  name = "resolveTxt"
}

/**
 * The two files where DNS resolution is intentional and guarded by the
 * SSRF policy. Anything else is suspicious.
 */
predicate isPolicyBoundaryFile(File f) {
  f.getRelativePath().matches("backend/src/application/assertSafeUrl.ts") or
  f.getRelativePath().matches("backend/src/application/resolveSafeAddress.ts")
}

from DataFlow::CallNode call, string name
where
  // A property read off a value imported from `dns` or `node:dns`
  // (covers both `dns.lookup(...)` and `import { lookup } from 'dns'`
  // when the imported name is used directly).
  exists(DataFlow::SourceNode dnsModule |
    dnsModule = DataFlow::moduleImport("dns") or
    dnsModule = DataFlow::moduleImport("node:dns") or
    dnsModule = DataFlow::moduleImport("dns/promises") or
    dnsModule = DataFlow::moduleImport("node:dns/promises")
  |
    call = dnsModule.getAMemberCall(name)
    or
    call = dnsModule.getAPropertyRead("promises").getAMemberCall(name)
  ) and
  isResolutionMember(name) and
  not isPolicyBoundaryFile(call.getFile())
select call,
  "DNS resolution (`" + name +
    "`) outside the SSRF policy boundary. Route through " +
    "`assertSafeUrl` / `resolveSafeAddress` instead — see ADR 0003."
