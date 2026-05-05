"use client";
import { useEffect } from "react";

// Dev-only accessibility checker. @axe-core/react is an optional dev dep:
// run `npm --workspace frontend i -D @axe-core/react` to activate.
export function AxeDev() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (typeof window === "undefined") return;
    let cancelled = false;
    (async () => {
      try {
        // Dynamic imports of optional dev deps; runtime-only, types erased on purpose.
        const React = await import("react");
        const ReactDOM = (await import("react-dom" as string)) as unknown;
        const axeMod = (await import("@axe-core/react" as string)) as unknown;
        if (cancelled) return;
        const axe =
          (axeMod as { default?: (...args: unknown[]) => void }).default ??
          (axeMod as (...args: unknown[]) => void);
        axe(React, ReactDOM, 1000);
      } catch {
        // axe not installed, skip silently
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
