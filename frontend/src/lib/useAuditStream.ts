"use client";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { API_URL, fetcher } from "./api";
import { pollingIntervalFor } from "./auditState";
import type { AuditDetail } from "./types";

/**
 * Streams an audit's lifecycle from the backend SSE endpoint
 * `GET /api/audits/:publicId/events`. Falls back to the existing SWR
 * poll when:
 *   - the runtime has no `EventSource` (older Safari, very old
 *     browsers, server-side rendering — `EventSource` is undefined
 *     during the SSR pass);
 *   - the connection errors before delivering a single state event
 *     (a captive portal, a corp proxy that buffers SSE, etc.).
 *
 * The SWR poll only runs while the source-of-truth value is "fallback"
 * — once SSE delivers a state, SWR is silent. SWR is also kept on
 * during the SSE phase as a safety net for stale browser tabs that
 * disconnected and reconnected, but with the same `pollingIntervalFor`
 * pacing as before so the request volume is identical to v1.0.0-rc.1
 * in the fallback path.
 */

type Source = "sse" | "fallback";

export interface AuditStream {
  data: AuditDetail | undefined;
  error: unknown;
  isLoading: boolean;
  mutate: () => Promise<unknown>;
  source: Source;
}

export function useAuditStream(id: string): AuditStream {
  const [streamed, setStreamed] = useState<AuditDetail | undefined>(undefined);
  const [streamError, setStreamError] = useState<unknown>(undefined);
  const [source, setSource] = useState<Source>("sse");
  const seenStateRef = useRef(false);

  // SWR is the safety net. It runs at the same cadence as before
  // (3 s while the audit is queued/running, off when terminal). Once
  // SSE delivers a state, we still let SWR re-fetch on focus / reconnect
  // — it's idempotent and cheap.
  const swr = useSWR<AuditDetail>(id ? `${API_URL}/api/audits/${id}` : null, fetcher, {
    refreshInterval: source === "fallback" ? pollingIntervalFor : 0,
    shouldRetryOnError: false,
  });

  useEffect(() => {
    if (!id) return;
    // SSR / unsupported runtime: stay on the fallback poll forever.
    if (typeof EventSource === "undefined") {
      setSource("fallback");
      return;
    }

    const url = `${API_URL}/api/audits/${id}/events`;
    let es: EventSource;
    try {
      es = new EventSource(url);
    } catch {
      setSource("fallback");
      return;
    }

    const onState = (ev: MessageEvent) => {
      try {
        const parsed = JSON.parse(ev.data) as AuditDetail;
        seenStateRef.current = true;
        setStreamed(parsed);
        setStreamError(undefined);
      } catch (err) {
        setStreamError(err);
      }
    };
    const onEnd = () => {
      es.close();
    };
    const onError = () => {
      // EventSource auto-reconnects on transient errors; the browser
      // surfaces `error` events for those too. Only fall back if we
      // never managed to receive a single `state` event — that's the
      // signal the channel is unusable in this environment.
      if (!seenStateRef.current) {
        es.close();
        setSource("fallback");
      }
    };

    es.addEventListener("state", onState as EventListener);
    es.addEventListener("end", onEnd);
    es.addEventListener("error", onError);

    return () => {
      es.removeEventListener("state", onState as EventListener);
      es.removeEventListener("end", onEnd);
      es.removeEventListener("error", onError);
      es.close();
    };
  }, [id]);

  // Prefer SSE-delivered state when present; fall through to SWR.
  const data = streamed ?? swr.data;
  // Only surface SWR error when SSE hasn't delivered anything either,
  // so a transient SWR network blip doesn't mask a successful SSE
  // payload that's already on screen.
  const error = streamed ? undefined : (streamError ?? swr.error);
  const isLoading = !data && !error && (swr.isLoading || source === "sse");

  return {
    data,
    error,
    isLoading,
    mutate: swr.mutate,
    source,
  };
}
