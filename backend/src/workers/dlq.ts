import type { Logger } from "pino";
import { auditDeadLetterTotal } from "@/infrastructure/metrics/registry";
import type { AuditDeadLetterData, AuditJobData } from "@/infrastructure/queue/auditQueue";

/**
 * Pure-ish dispatcher that decides whether a freshly-failed BullMQ job
 * has exhausted its retry budget and, if so, moves a dead-letter
 * payload onto the parallel `audits-dead` queue while incrementing the
 * dlq counter. The deadQueue.add side effect and the logger are
 * injected so the policy can be unit-tested without Redis or BullMQ.
 *
 * Policy:
 * - Fire only on the FINAL attempt. BullMQ emits `failed` once per
 *   attempt; intermediate retries should NOT pollute the DLQ.
 * - Idempotent dead-letter id: `dead:<publicId>` so a job that fails
 *   twice via two `failed` emissions in pathological retry scenarios
 *   does not double-write to the DLQ.
 * - Any error from the deadQueue write is logged and swallowed: the
 *   live worker must not crash because the DLQ is misconfigured.
 */

function classifyFailure(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("timeout")) return "timeout";
  if (m.includes("net::") || m.includes("dns")) return "network";
  if (m.includes("unsafe_") || m.includes("ssrf")) return "ssrf";
  if (m.includes("disconnected") || m.includes("crashed")) return "browser_crash";
  return "other";
}

export interface DeadLetterJobLike {
  id?: string | undefined;
  data: AuditJobData;
  attemptsMade: number;
  opts?: { attempts?: number } | undefined;
}

export interface DeadLetterQueueLike {
  add(name: string, data: AuditDeadLetterData, opts?: { jobId?: string }): Promise<unknown>;
}

export interface MoveToDLQDeps {
  deadQueue: DeadLetterQueueLike;
  logger: Pick<Logger, "info" | "warn" | "error">;
  now?: () => Date;
}

export async function moveToDeadLetterIfFinal(
  job: DeadLetterJobLike | undefined,
  err: Error | undefined,
  deps: MoveToDLQDeps
): Promise<"moved" | "retry-pending" | "skipped"> {
  if (!job) {
    deps.logger.warn("worker.failed fired without a job; skipping DLQ");
    return "skipped";
  }
  const totalAttempts = job.opts?.attempts ?? 1;
  if (job.attemptsMade < totalAttempts) {
    return "retry-pending";
  }
  const errorMessage = err?.message ?? "unknown error";
  const reason = classifyFailure(errorMessage);
  const payload: AuditDeadLetterData = {
    ...job.data,
    failedAt: (deps.now?.() ?? new Date()).toISOString(),
    errorMessage,
    attemptsMade: job.attemptsMade,
  };
  try {
    await deps.deadQueue.add("dead-letter", payload, {
      jobId: `dead:${job.data.publicId}`,
    });
    auditDeadLetterTotal.inc({ reason });
    deps.logger.warn(
      { publicId: job.data.publicId, attemptsMade: job.attemptsMade, reason },
      "audit job moved to dead-letter queue"
    );
    return "moved";
  } catch (dlqErr) {
    deps.logger.error(
      { err: dlqErr, publicId: job.data.publicId },
      "failed to enqueue dead-letter; dropping"
    );
    return "skipped";
  }
}
