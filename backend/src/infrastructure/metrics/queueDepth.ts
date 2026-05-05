import type { Queue } from "bullmq";
import { auditQueueDepth } from "./registry";

/**
 * Periodically pulls counts from BullMQ into the auditQueueDepth gauge.
 * Cheap (one Redis round-trip), and decoupled from the request path so a
 * Redis hiccup never fails a /metrics scrape — we just keep the last
 * sample. Cancel the returned timer on shutdown.
 */
export function startQueueDepthSampler(queue: Queue, intervalMs = 10_000): NodeJS.Timeout {
  const sample = async () => {
    try {
      const counts = await queue.getJobCounts("wait", "active", "delayed", "failed", "completed");
      auditQueueDepth.set({ status: "wait" }, counts.wait ?? 0);
      auditQueueDepth.set({ status: "active" }, counts.active ?? 0);
      auditQueueDepth.set({ status: "delayed" }, counts.delayed ?? 0);
      auditQueueDepth.set({ status: "failed" }, counts.failed ?? 0);
    } catch {
      // Leave the previous values in place; next tick retries.
    }
  };
  void sample();
  const handle = setInterval(() => void sample(), intervalMs);
  // Don't keep the event loop alive just for the sampler.
  handle.unref();
  return handle;
}
