import {
  SpanKind,
  SpanStatusCode,
  context,
  propagation,
  trace,
  type Span,
} from "@opentelemetry/api";

const TRACER_NAME = "euthus";

/**
 * Run `fn` inside a span with the given name and attributes. Records
 * any thrown error on the span (sets status to ERROR) and re-throws.
 * When the OTel SDK isn't started, the underlying tracer returns a
 * no-op span — these wrappers stay safe and cheap.
 */
export async function withSpan<T>(
  name: string,
  attrs: Record<string, string | number | boolean>,
  fn: (span: Span) => Promise<T>,
  opts?: { kind?: SpanKind }
): Promise<T> {
  const tracer = trace.getTracer(TRACER_NAME);
  return tracer.startActiveSpan(
    name,
    { kind: opts?.kind ?? SpanKind.INTERNAL, attributes: attrs },
    async (span) => {
      try {
        return await fn(span);
      } catch (err) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err instanceof Error ? err.message : String(err),
        });
        if (err instanceof Error) span.recordException(err);
        throw err;
      } finally {
        span.end();
      }
    }
  );
}

/**
 * Serialize the current active context to a W3C `traceparent` string
 * (and optional `tracestate`). Use to attach the parent context to a
 * BullMQ job payload so the worker can resume the trace.
 *
 * Returns undefined when the SDK isn't started (or there's no active
 * span) so the producer doesn't ship a meaningless empty header.
 */
export function captureTraceparent(): { traceparent: string; tracestate?: string } | undefined {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  const traceparent = carrier["traceparent"];
  if (!traceparent) return undefined;
  const tracestate = carrier["tracestate"];
  return tracestate ? { traceparent, tracestate } : { traceparent };
}

/**
 * Re-enter the W3C trace context represented by a previously-captured
 * `traceparent` so spans created inside `fn` inherit that parent.
 */
export async function withRestoredContext<T>(
  payload: { traceparent?: string | undefined; tracestate?: string | undefined } | undefined,
  fn: () => Promise<T>
): Promise<T> {
  if (!payload?.traceparent) return fn();
  const carrier: Record<string, string> = { traceparent: payload.traceparent };
  if (payload.tracestate) carrier["tracestate"] = payload.tracestate;
  const restored = propagation.extract(context.active(), carrier);
  return context.with(restored, fn);
}

export { SpanKind };
