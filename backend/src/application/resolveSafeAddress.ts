import dns from "node:dns/promises";
import { isBlockedIp } from "@/domain/urlSafety";
import { UnsafeUrlError, type DnsResolver } from "./assertSafeUrl";

/**
 * DNS-rebinding hardening: returns the *one* IP address we will connect to,
 * after asserting it's a public unicast address. The caller is expected to
 * use this IP for the actual TCP/TLS connection (e.g. via Puppeteer's
 * --host-resolver-rules) so that a hostile resolver cannot return a public
 * IP at intake and a private IP a millisecond later when the connection
 * happens.
 *
 * Returns null for hostnames that don't resolve, are non-public, or where
 * resolution returned both safe and unsafe addresses (we conservatively
 * refuse rather than picking).
 */
const defaultResolver: DnsResolver = (hostname) => dns.lookup(hostname, { all: true });

export async function resolveSafeAddress(
  hostname: string,
  resolver: DnsResolver = defaultResolver
): Promise<string> {
  let addresses: Array<{ address: string }>;
  try {
    addresses = await resolver(hostname);
  } catch {
    throw new UnsafeUrlError("unresolvable_host");
  }
  if (addresses.length === 0) throw new UnsafeUrlError("unresolvable_host");

  // All-or-nothing: one unsafe address among the candidates is enough to
  // refuse — we can't trust which one Chromium would have picked.
  for (const { address } of addresses) {
    if (isBlockedIp(address)) throw new UnsafeUrlError("unsafe_target");
  }

  // Stable: first address wins. dns.lookup already orders by getaddrinfo
  // order (typically the OS preference), so this is what node would have
  // chosen anyway — we just freeze the choice.
  return addresses[0]!.address;
}
