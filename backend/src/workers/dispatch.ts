import type { Logger } from "pino";

/**
 * Pure-ish dispatch: walks one BullMQ audit job through the
 * queued -> running -> done|failed state machine, persisting at each
 * transition. The audit-runner and the model API are injected so the
 * dispatch logic can be unit-tested with stubs (no Puppeteer, no Mongo).
 */

export interface AuditJobInput {
  publicId: string;
  url: string;
  requestId?: string;
}

export interface AuditOutcome {
  score: number;
  totals: { critical: number; serious: number; moderate: number; minor: number };
  passes: number;
  durationMs: number;
}

export interface AuditModelLike {
  updateOne(
    filter: { publicId: string },
    update: { $set: Record<string, unknown> }
  ): Promise<unknown>;
}

export interface DispatchDeps {
  runAudit: (url: string) => Promise<AuditOutcome>;
  model: AuditModelLike;
  logger: Pick<Logger, "info" | "error" | "child">;
}

export async function processAuditJob(
  job: AuditJobInput,
  deps: DispatchDeps
): Promise<AuditOutcome> {
  const { publicId, url, requestId } = job;
  const jobLogger = deps.logger.child({
    requestId: requestId ?? "unknown",
    publicId,
  });
  jobLogger.info({ url }, "audit job start");
  await deps.model.updateOne({ publicId }, { $set: { status: "running" } });
  try {
    const result = await deps.runAudit(url);
    await deps.model.updateOne({ publicId }, { $set: { status: "done", ...result } });
    jobLogger.info({ score: result.score }, "audit job done");
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await deps.model.updateOne({ publicId }, { $set: { status: "failed", error: message } });
    jobLogger.error({ err }, "audit job failed");
    throw err;
  }
}
