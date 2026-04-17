import dns from "node:dns/promises";
import { isBlockedIp, isLiteralIp } from "@/domain/urlSafety";

export type UnsafeReason =
  | "invalid_url"
  | "unsafe_protocol"
  | "unresolvable_host"
  | "unsafe_target";

export class UnsafeUrlError extends Error {
  readonly reason: UnsafeReason;
  constructor(reason: UnsafeReason) {
    super(`unsafe_url:${reason}`);
    this.name = "UnsafeUrlError";
    this.reason = reason;
  }
}

export type DnsResolver = (hostname: string) => Promise<Array<{ address: string }>>;

const ALLOWED_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:"]);

const defaultResolver: DnsResolver = (hostname) =>
  dns.lookup(hostname, { all: true });

function stripBrackets(host: string): string {
  return host.replace(/^\[|\]$/g, "");
}

/**
 * Assert that an audit URL is safe to open in a headless browser. Rejects non-http(s)
 * protocols, unresolvable hosts, and any URL whose hostname resolves (or literally
 * points) to a non-public IP range: loopback, RFC1918, link-local (cloud metadata),
 * multicast, broadcast, or any other reserved space.
 *
 * The DNS resolver is injected so tests can run without touching the network, and so
 * the worker can reuse the same policy before navigating.
 */
export async function assertSafeUrl(
  raw: string,
  resolver: DnsResolver = defaultResolver
): Promise<void> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("invalid_url");
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new UnsafeUrlError("unsafe_protocol");
  }

  const host = stripBrackets(url.hostname);
  if (host === "") {
    throw new UnsafeUrlError("invalid_url");
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await resolver(host);
  } catch {
    throw new UnsafeUrlError("unresolvable_host");
  }

  if (addresses.length === 0) {
    throw new UnsafeUrlError("unresolvable_host");
  }

  for (const { address } of addresses) {
    if (isBlockedIp(address)) {
      throw new UnsafeUrlError("unsafe_target");
    }
  }
}

/**
 * Synchronous companion used inside Puppeteer's request interceptor, which fires
 * for every subresource and every redirect target. A full DNS check per request is
 * too expensive, so this path only enforces protocol and blocks literal private-IP
 * hostnames. The async assertSafeUrl above covers DNS-resolved hostnames at intake.
 */
export function isSyncSafeUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return false;
  const host = stripBrackets(url.hostname);
  if (host === "") return false;
  if (isLiteralIp(host)) return !isBlockedIp(host);
  return true;
}
