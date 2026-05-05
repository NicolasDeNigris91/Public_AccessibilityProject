"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { onCLS, onFCP, onINP, onLCP, onTTFB } from "web-vitals";
import { API_URL } from "@/lib/api";
import { sendVitalBeacon } from "@/lib/rum";

/**
 * Mounts the web-vitals listeners exactly once per page lifecycle.
 * Each listener fires when the metric is "final" (e.g. LCP fires on
 * the largest paint observed up to user input or page hide), at which
 * point we beacon it to /api/rum.
 *
 * Skipped in development and test: the dev experience already shows
 * Web Vitals in the Next.js overlay, and we don't want a `npm run
 * dev` session to spam the metric backend.
 */
export function RumTracker() {
  const pathname = usePathname();
  const installed = useRef(false);

  useEffect(() => {
    if (installed.current) return;
    if (process.env.NODE_ENV !== "production") return;
    installed.current = true;

    // Snapshot pathname at install time. The hook itself fires once
    // per metric per page lifecycle; SPA route changes don't re-mount
    // the listeners (web-vitals owns the page-lifecycle events) so the
    // route reported is the one the metric was measured on.
    const path = pathname ?? "/";
    const handler = (m: { name: string; value: number }) => {
      sendVitalBeacon(API_URL, path, { name: m.name as never, value: m.value });
    };

    onLCP(handler);
    onINP(handler);
    onFCP(handler);
    onTTFB(handler);
    onCLS(handler);
  }, [pathname]);

  return null;
}
