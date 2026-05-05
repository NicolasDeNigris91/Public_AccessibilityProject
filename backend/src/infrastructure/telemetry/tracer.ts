import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

/**
 * Boot OpenTelemetry tracing with HTTP/Express/Mongoose/IORedis auto-
 * instrumentation. The SDK only starts when OTEL_EXPORTER_OTLP_ENDPOINT
 * is configured — otherwise this is a no-op so the api/worker can run
 * locally and in CI without any OTel collector running.
 *
 * Optional env:
 * - OTEL_EXPORTER_OTLP_ENDPOINT: base URL for the collector.
 *   Default destination intent is Grafana Tempo Cloud, but the value
 *   is just an OTLP/HTTP endpoint, so any compatible backend works.
 * - OTEL_EXPORTER_OTLP_HEADERS: comma-separated `key=value` pairs
 *   (e.g. `Authorization=Bearer abc,X-Scope-OrgID=1`). For Grafana
 *   Cloud free tier this carries the basic-auth header.
 *
 * Must be imported BEFORE any other module the SDK should
 * instrument (express, mongoose, ioredis). Convention: a tiny
 * `tracerInit-*.ts` preamble at the top of each entry point.
 */
export interface TelemetryOptions {
  serviceName: string;
  serviceVersion?: string;
  /**
   * If true, ignore the OTEL env vars and never start the SDK.
   * Used by tests so importing this module from a unit test doesn't
   * spin up a real exporter loop.
   */
  forceDisable?: boolean;
}

interface ParsedHeaders {
  [key: string]: string;
}

function parseHeaders(raw: string | undefined): ParsedHeaders | undefined {
  if (!raw) return undefined;
  const out: ParsedHeaders = {};
  for (const pair of raw.split(",")) {
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const k = pair.slice(0, eq).trim();
    const v = pair.slice(eq + 1).trim();
    if (k && v) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function startTelemetry(opts: TelemetryOptions): NodeSDK | undefined {
  if (opts.forceDisable) return undefined;
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return undefined;

  const headers = parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS);
  const exporter = new OTLPTraceExporter({
    url: endpoint.replace(/\/$/, "") + "/v1/traces",
    ...(headers ? { headers } : {}),
  });

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: opts.serviceName,
    ...(opts.serviceVersion ? { [ATTR_SERVICE_VERSION]: opts.serviceVersion } : {}),
  });

  const sdk = new NodeSDK({
    resource,
    traceExporter: exporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        // The fs instrumentation is noisy and rarely useful for HTTP-
        // shaped services; keep it off so traces stay readable.
        "@opentelemetry/instrumentation-fs": { enabled: false },
        // Don't trace /health and /ready — they spam the trace
        // backend on every k8s probe and have no diagnostic value.
        "@opentelemetry/instrumentation-http": {
          ignoreIncomingRequestHook: (req) => {
            const url = req.url ?? "";
            return url === "/health" || url === "/ready" || url === "/metrics";
          },
        },
      }),
    ],
  });

  sdk.start();

  process.on("SIGTERM", () => {
    void sdk.shutdown();
  });

  return sdk;
}

/**
 * Helper to read the lower-cased `traceparent` value from a Headers /
 * record-shaped object. BullMQ doesn't carry HTTP headers, but the
 * AuditJobData payload does carry a traceparent string we attach at
 * enqueue time so the worker span can inherit the api span's parent.
 */
export const TRACEPARENT_KEY = "traceparent";

/**
 * Manual-span helpers built on top of `@opentelemetry/api`. These
 * re-export tiny wrappers so callers don't need to know the
 * propagation API directly. When the SDK is not started (no env
 * configured) these still work — they just produce no-op spans
 * that record nothing.
 */
