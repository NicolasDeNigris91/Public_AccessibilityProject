import { isSyncSafeUrl } from "./assertSafeUrl";

/**
 * Decision the Puppeteer request interceptor should take for a single
 * subrequest URL. Pure: only depends on the URL string, no DNS or I/O.
 *
 * - `allow` for legitimate http(s) URLs and inert data:/blob: URLs (axe
 *   itself can produce blob: payloads when running).
 * - `abort` for anything that resolves to a non-public address or uses an
 *   unsupported scheme. Catches redirects to private IPs that the intake
 *   DNS check could not see.
 */
export type SubrequestDecision = "allow" | "abort";

const INERT_SCHEMES = /^(data|blob):/i;

export function classifySubrequest(url: string): SubrequestDecision {
  if (INERT_SCHEMES.test(url)) return "allow";
  return isSyncSafeUrl(url) ? "allow" : "abort";
}
