import { QueueEvents } from "bullmq";
import type { Logger } from "pino";
import { AUDIT_QUEUE } from "./auditQueue";
import { redisConnection } from "./connection";

/**
 * In-process pub/sub over BullMQ `QueueEvents`. The SSE handler
 * subscribes per-`publicId` via `subscribe()`; we keep ONE shared
 * QueueEvents instance per api process so a thousand concurrent SSE
 * connections still mean one Redis subscriber, not a thousand.
 *
 * Lifecycle:
 * - `start(deps)` is idempotent and lazy — the first SSE connection
 *   triggers it; subsequent calls are no-ops.
 * - `subscribe(publicId, cb)` returns an `unsubscribe` function that
 *   removes the callback and, if it was the last subscriber, leaves
 *   the QueueEvents instance running (cheap; restarting it on every
 *   transition is more expensive than keeping it warm).
 * - `stop()` closes the QueueEvents and clears the table; called from
 *   the api graceful-shutdown path.
 *
 * What gets dispatched:
 * - `'state-change'` whenever BullMQ emits `active`, `progress`,
 *   `completed`, or `failed` for a job whose id matches the
 *   subscribed publicId. The SSE handler reacts by re-reading the
 *   audit from Mongo and emitting a `state` event to the client; the
 *   bus deliberately doesn't carry the full state, only the trigger.
 */

type EventName = "active" | "progress" | "completed" | "failed";
type Subscriber = (event: EventName) => void;

export interface AuditEventsBusDeps {
  /** Override for tests; in prod we use the real BullMQ QueueEvents. */
  factory?: () => QueueEvents;
  logger?: Pick<Logger, "warn" | "error" | "info">;
}

let queueEvents: QueueEvents | null = null;
const subscribers = new Map<string, Set<Subscriber>>();
let starting: Promise<void> | null = null;

function defaultFactory(): QueueEvents {
  return new QueueEvents(AUDIT_QUEUE, { connection: redisConnection });
}

function dispatch(jobId: string | undefined, name: EventName): void {
  if (!jobId) return;
  const set = subscribers.get(jobId);
  if (!set) return;
  for (const cb of set) {
    try {
      cb(name);
    } catch {
      // A misbehaving subscriber can't take the bus down.
    }
  }
}

export function start(deps: AuditEventsBusDeps = {}): Promise<void> {
  if (queueEvents) return Promise.resolve();
  if (starting) return starting;
  starting = (async () => {
    const qe = (deps.factory ?? defaultFactory)();
    qe.on("active", ({ jobId }) => dispatch(jobId, "active"));
    qe.on("progress", ({ jobId }) => dispatch(jobId, "progress"));
    qe.on("completed", ({ jobId }) => dispatch(jobId, "completed"));
    qe.on("failed", ({ jobId }) => dispatch(jobId, "failed"));
    await qe.waitUntilReady();
    queueEvents = qe;
    deps.logger?.info({ queue: AUDIT_QUEUE }, "audit events bus ready");
  })();
  try {
    return starting;
  } finally {
    starting.finally(() => {
      starting = null;
    });
  }
}

export function subscribe(publicId: string, cb: Subscriber): () => void {
  let set = subscribers.get(publicId);
  if (!set) {
    set = new Set<Subscriber>();
    subscribers.set(publicId, set);
  }
  set.add(cb);
  return () => {
    const s = subscribers.get(publicId);
    if (!s) return;
    s.delete(cb);
    if (s.size === 0) subscribers.delete(publicId);
  };
}

export async function stop(): Promise<void> {
  subscribers.clear();
  const qe = queueEvents;
  queueEvents = null;
  if (qe) {
    qe.removeAllListeners();
    await qe.close().catch(() => {});
  }
}

/** For tests only. */
export function _reset(): void {
  subscribers.clear();
  queueEvents = null;
  starting = null;
}

export function _peekSubscriberCount(publicId: string): number {
  return subscribers.get(publicId)?.size ?? 0;
}
