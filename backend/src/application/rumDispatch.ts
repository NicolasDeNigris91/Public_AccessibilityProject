import {
  webVitalCls,
  webVitalFcpSeconds,
  webVitalInpSeconds,
  webVitalLcpSeconds,
  webVitalRejectedTotal,
  webVitalTtfbSeconds,
} from "@/infrastructure/metrics/registry";

/**
 * Pure-ish dispatcher that routes a validated RUM beacon to the right
 * Prometheus histogram. The caller is responsible for parsing /
 * authorising the beacon — this function trusts its input and only
 * decides which series to observe and in which unit.
 *
 * Web-vitals reports CLS as a unitless number, all the others as
 * milliseconds. Prometheus convention is base units (seconds), so we
 * divide ms metrics by 1000 before observe(). CLS is published as-is.
 */

const ALLOWED_ROUTES: ReadonlySet<string> = new Set(["/", "/aprender", "/app", "/audits/[id]"]);

export type WebVitalName = "LCP" | "INP" | "FCP" | "TTFB" | "CLS";

export interface WebVitalBeacon {
  name: string;
  value: number;
  route: string;
}

export type DispatchOutcome =
  | { ok: true; observed: WebVitalName }
  | { ok: false; reason: "name" | "route" | "value" };

const NAMES: ReadonlySet<string> = new Set(["LCP", "INP", "FCP", "TTFB", "CLS"]);

export function dispatchWebVital(beacon: WebVitalBeacon): DispatchOutcome {
  if (!NAMES.has(beacon.name)) {
    webVitalRejectedTotal.inc({ reason: "name" });
    return { ok: false, reason: "name" };
  }
  if (!ALLOWED_ROUTES.has(beacon.route)) {
    webVitalRejectedTotal.inc({ reason: "route" });
    return { ok: false, reason: "route" };
  }
  // web-vitals never reports negative values; clamp to a hard upper
  // bound to keep histogram buckets honest. 60s is well past the
  // largest LCP a real user would tolerate before bouncing.
  if (!Number.isFinite(beacon.value) || beacon.value < 0 || beacon.value > 60_000) {
    webVitalRejectedTotal.inc({ reason: "value" });
    return { ok: false, reason: "value" };
  }
  const labels = { route: beacon.route };
  switch (beacon.name as WebVitalName) {
    case "LCP":
      webVitalLcpSeconds.observe(labels, beacon.value / 1000);
      return { ok: true, observed: "LCP" };
    case "INP":
      webVitalInpSeconds.observe(labels, beacon.value / 1000);
      return { ok: true, observed: "INP" };
    case "FCP":
      webVitalFcpSeconds.observe(labels, beacon.value / 1000);
      return { ok: true, observed: "FCP" };
    case "TTFB":
      webVitalTtfbSeconds.observe(labels, beacon.value / 1000);
      return { ok: true, observed: "TTFB" };
    case "CLS":
      webVitalCls.observe(labels, beacon.value);
      return { ok: true, observed: "CLS" };
  }
}
