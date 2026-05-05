import { Router, type Request, type Response } from "express";
import type { Logger } from "pino";
import { AuditModel } from "@/infrastructure/db/AuditModel";
import * as bus from "@/infrastructure/queue/auditEventsBus";
import { logger as defaultLogger } from "@/config/logger";

/**
 * Server-Sent Events stream for a single audit's lifecycle. Replaces
 * the 3-second SWR poll on the frontend with a push channel that
 * delivers status transitions as the worker emits them, and shuts
 * down on terminal state.
 *
 * Why SSE and not WebSocket: the channel is unidirectional (server →
 * browser), survives proxies/firewalls without special config, and
 * uses standard HTTP, so it composes with the existing rate limit,
 * helmet, and pino-http middlewares without ceremony.
 *
 * Wire format (one event per state transition):
 *   event: state
 *   data: {"publicId":"...","status":"running","score":null,...}
 *
 *   event: end
 *   data: {"reason":"done"}     // or "failed" | "not-found"
 *
 * Heartbeat: a lone `:hb` comment line every 15 s so reverse proxies
 * don't time the connection out (nginx, Railway's edge, Cloudflare
 * all idle-close at 30-60 s).
 */

interface DocSummary {
  publicId: string;
  status: "queued" | "running" | "done" | "failed";
  score?: number;
  totals?: { critical: number; serious: number; moderate: number; minor: number };
  url?: string;
  createdAt?: Date;
  error?: string;
}

const HEARTBEAT_MS = 15_000;
const TERMINAL: ReadonlySet<DocSummary["status"]> = new Set(["done", "failed"]);

async function fetchDoc(publicId: string): Promise<DocSummary | null> {
  // Same projection the public detail route exposes — keep wire
  // contracts aligned so SSE clients see the same shape they'd see
  // on a manual GET.
  const doc = await AuditModel.findOne({ publicId })
    .select("publicId url status score totals violations passes durationMs error createdAt -_id")
    .lean<DocSummary | null>();
  return doc;
}

export interface AuditEventsDeps {
  fetch: (publicId: string) => Promise<DocSummary | null>;
  subscribe: typeof bus.subscribe;
  start: typeof bus.start;
  logger?: Pick<Logger, "warn" | "info" | "error">;
  heartbeatMs?: number;
}

export function buildHandler(deps: AuditEventsDeps) {
  const heartbeatMs = deps.heartbeatMs ?? HEARTBEAT_MS;
  return async function handler(req: Request, res: Response): Promise<void> {
    const publicId = req.params.publicId ?? "";
    if (!publicId) {
      res.status(400).end();
      return;
    }

    res.set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable response buffering on nginx-style edges (Railway sits
      // behind one).
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders?.();

    const writeEvent = (event: string, data: unknown): boolean => {
      if (res.writableEnded) return false;
      try {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        return true;
      } catch {
        return false;
      }
    };

    const writeHeartbeat = (): void => {
      if (res.writableEnded) return;
      try {
        res.write(`:hb\n\n`);
      } catch {
        /* socket gone; cleanup runs via 'close' */
      }
    };

    let unsubscribe: (() => void) | null = null;
    let heartbeat: NodeJS.Timeout | null = null;
    let inflight = false;
    let closed = false;

    const cleanup = (): void => {
      if (closed) return;
      closed = true;
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
    };

    req.on("close", cleanup);

    const emitState = async (): Promise<void> => {
      // Coalesce concurrent triggers — a flurry of 'progress' +
      // 'completed' shouldn't stack DB reads.
      if (inflight) return;
      inflight = true;
      try {
        const doc = await deps.fetch(publicId);
        if (closed) return;
        if (!doc) {
          writeEvent("end", { reason: "not-found" });
          res.end();
          cleanup();
          return;
        }
        const ok = writeEvent("state", doc);
        if (!ok) {
          cleanup();
          return;
        }
        if (TERMINAL.has(doc.status)) {
          writeEvent("end", { reason: doc.status });
          res.end();
          cleanup();
        }
      } catch (err) {
        deps.logger?.warn({ err, publicId }, "audit events: failed to read audit doc");
        writeEvent("end", { reason: "error" });
        if (!res.writableEnded) res.end();
        cleanup();
      } finally {
        inflight = false;
      }
    };

    // Initial state push: covers the "audit already finished before
    // the client connected" case without waiting for an event.
    await emitState();
    if (closed) return;

    // Subscribe to the bus and keep the connection warm with periodic
    // comments. start() is idempotent.
    await deps.start({});
    unsubscribe = deps.subscribe(publicId, () => {
      void emitState();
    });
    heartbeat = setInterval(writeHeartbeat, heartbeatMs);
    // Don't keep the event loop alive just for an idle SSE client.
    heartbeat.unref?.();
  };
}

export const auditEventsRouter = Router({ mergeParams: true });
auditEventsRouter.get(
  "/:publicId/events",
  buildHandler({
    fetch: fetchDoc,
    subscribe: bus.subscribe,
    start: bus.start,
    logger: defaultLogger,
  })
);
