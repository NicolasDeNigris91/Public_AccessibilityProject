import ipaddr from "ipaddr.js";

/**
 * True when an IP address must not be audited: loopback, RFC1918 private, link-local
 * (includes cloud metadata endpoints such as 169.254.169.254), multicast, broadcast,
 * and every other non-public range reported by ipaddr.js.
 *
 * Accepts IPv4, IPv6, and IPv4-mapped IPv6 (unwrapped before classification).
 * Defensive default: unparseable input returns true (blocked).
 */
export function isBlockedIp(ipString: string): boolean {
  let addr: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    addr = ipaddr.parse(ipString);
  } catch {
    return true;
  }

  if (addr.kind() === "ipv6" && (addr as ipaddr.IPv6).isIPv4MappedAddress()) {
    addr = (addr as ipaddr.IPv6).toIPv4Address();
  }

  return addr.range() !== "unicast";
}

/**
 * True when a bare host string is a parseable IP literal (v4 or v6). Used to decide
 * whether a URL's hostname needs an IP check or a DNS resolution.
 */
export function isLiteralIp(host: string): boolean {
  return ipaddr.isValid(host);
}
