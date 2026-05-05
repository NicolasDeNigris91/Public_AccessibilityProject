import { Queue } from "bullmq";
import { redisConnection } from "./connection";

export interface AuditJobData {
  publicId: string;
  url: string;
  // Propagated from the HTTP layer so worker logs and DB audit trails share a
  // single correlation id with the request that enqueued the job.
  requestId?: string;
}

/**
 * Dead-letter payload for an audit job that exhausted all attempts.
 * The worker copies the original AuditJobData onto this envelope and
 * appends the failure reason + the timestamp at which the dispatch
 * gave up, so the DLQ entry has everything an operator needs to
 * triage without joining back to the live queue.
 */
export interface AuditDeadLetterData extends AuditJobData {
  failedAt: string;
  errorMessage: string;
  attemptsMade: number;
}

export const AUDIT_QUEUE = "audits";
export const AUDIT_DEAD_QUEUE = "audits-dead";

export const auditQueue = new Queue<AuditJobData>(AUDIT_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 24 * 3600 },
  },
});

/**
 * Dead-letter queue for audits that exhausted attempts. Kept on a
 * separate BullMQ queue so the live queue stays small + scrapeable
 * and so operators can replay with the standard Bull-Board affordances.
 * Entries linger for 30 days to give us a forensics window on bad URLs
 * that hit a class of failures (Puppeteer crashloop, intermittent SSRF
 * targets, etc.).
 */
export const auditDeadQueue = new Queue<AuditDeadLetterData>(AUDIT_DEAD_QUEUE, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { age: 30 * 24 * 3600 },
    removeOnFail: { age: 30 * 24 * 3600 },
  },
});
