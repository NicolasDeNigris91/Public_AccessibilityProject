// Real User Monitoring — emits Core Web Vitals to the backend.
// One beacon per metric per page lifecycle. We intentionally classify
// the current pathname into one of the documented route keys so the
// backend's `route` label stays low-cardinality (no `/audits/<uuid>`
// in series).

import type { MetricType } from "web-vitals";

const ROUTE_KEYS = ["/", "/aprender", "/app", "/audits/[id]"] as const;
type RouteKey = (typeof ROUTE_KEYS)[number];

export function routeKeyFromPath(pathname: string): RouteKey | null {
  if (pathname === "/") return "/";
  if (pathname === "/aprender") return "/aprender";
  if (pathname === "/app") return "/app";
  if (/^\/audits\/[^/]+\/?$/.test(pathname)) return "/audits/[id]";
  return null;
}

interface VitalEntry {
  name: MetricType["name"];
  value: number;
}

/**
 * Send a single web-vitals beacon. Prefers `navigator.sendBeacon` so
 * the request rides through the page-unload phase reliably; falls back
 * to fetch with `keepalive` when sendBeacon is unavailable. All
 * failures are swallowed — telemetry must never throw at the user.
 */
export function sendVitalBeacon(
  apiUrl: string,
  pathname: string,
  metric: VitalEntry,
  send: (url: string, body: string) => void = defaultSend
): void {
  const route = routeKeyFromPath(pathname);
  if (!route) return; // unknown route: don't pollute the metric backend
  const body = JSON.stringify({
    name: metric.name,
    value: metric.value,
    route,
  });
  try {
    send(`${apiUrl}/api/rum`, body);
  } catch {
    /* never throw from telemetry */
  }
}

function defaultSend(url: string, body: string): void {
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon(url, blob)) return;
  }
  // Fallback for environments without sendBeacon. `keepalive: true`
  // lets the request outlive the unloading page on most browsers.
  if (typeof fetch === "function") {
    void fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  }
}
