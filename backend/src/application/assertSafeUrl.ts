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

const defaultResolver: DnsResolver = (hostname) => dns.lookup(hostname, { all: true });

function stripBrackets(host: string): string {
  return host.replace(/^\[|\]$/g, "");
}

// Resolver is injected so tests can run offline and the worker can reuse the
// same policy before navigation.
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

// Sync version for the request interceptor. Per-request DNS would be too slow,
// so this only catches literal private-IP hostnames.
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
