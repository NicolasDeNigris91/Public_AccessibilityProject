import type { Queue } from "bullmq";
import { auditQueueDepth, registry } from "./registry";
import { startQueueDepthSampler } from "./queueDepth";

function fakeQueue(
  counts: Partial<Record<"wait" | "active" | "delayed" | "failed" | "completed", number>>
): { queue: Queue; getJobCounts: jest.Mock } {
  const getJobCounts = jest.fn().mockResolvedValue(counts);
  const queue = { getJobCounts } as unknown as Queue;
  return { queue, getJobCounts };
}

async function flushPromises(): Promise<void> {
  // Two awaits because the sampler schedules a microtask for the
  // initial sample and another for the .set() on the gauge.
  await Promise.resolve();
  await Promise.resolve();
}

async function readGauge(status: string): Promise<number> {
  const metric = await registry.getSingleMetric("audit_queue_depth")?.get();
  if (!metric) return Number.NaN;
  const sample = (metric.values as Array<{ value: number; labels: Record<string, string> }>).find(
    (v) => v.labels.status === status
  );
  return sample?.value ?? Number.NaN;
}

describe("startQueueDepthSampler", () => {
  beforeEach(() => {
    auditQueueDepth.reset();
  });

  it("samples immediately on start and writes one value per known status", async () => {
    const { queue, getJobCounts } = fakeQueue({
      wait: 7,
      active: 2,
      delayed: 1,
      failed: 3,
      completed: 99, // not exposed as a gauge label
    });
    const handle = startQueueDepthSampler(queue, 60_000);
    try {
      await flushPromises();
      expect(getJobCounts).toHaveBeenCalledWith("wait", "active", "delayed", "failed", "completed");
      expect(await readGauge("wait")).toBe(7);
      expect(await readGauge("active")).toBe(2);
      expect(await readGauge("delayed")).toBe(1);
      expect(await readGauge("failed")).toBe(3);
    } finally {
      clearInterval(handle);
    }
  });

  it("treats missing counts as zero so the gauge never goes NaN", async () => {
    const { queue } = fakeQueue({});
    const handle = startQueueDepthSampler(queue, 60_000);
    try {
      await flushPromises();
      expect(await readGauge("wait")).toBe(0);
      expect(await readGauge("active")).toBe(0);
      expect(await readGauge("delayed")).toBe(0);
      expect(await readGauge("failed")).toBe(0);
    } finally {
      clearInterval(handle);
    }
  });

  it("swallows getJobCounts failures and keeps the previous sample", async () => {
    const getJobCounts = jest
      .fn<Promise<Record<string, number>>, []>()
      .mockResolvedValueOnce({ wait: 5, active: 0, delayed: 0, failed: 0 })
      .mockRejectedValue(new Error("redis gone"));
    const queue = { getJobCounts } as unknown as Queue;

    jest.useFakeTimers();
    try {
      const handle = startQueueDepthSampler(queue, 1_000);
      try {
        await flushPromises();
        expect(await readGauge("wait")).toBe(5);

        // Drive the interval forward — second call rejects, gauge must
        // hold its previous value.
        jest.advanceTimersByTime(1_000);
        await flushPromises();
        expect(getJobCounts).toHaveBeenCalledTimes(2);
        expect(await readGauge("wait")).toBe(5);
      } finally {
        clearInterval(handle);
      }
    } finally {
      jest.useRealTimers();
    }
  });

  it("returns an unref'd interval timer so it doesn't keep the process alive", async () => {
    const { queue } = fakeQueue({});
    const handle = startQueueDepthSampler(queue, 60_000);
    try {
      // NodeJS.Timeout exposes hasRef() since 11.0; the sampler unref()s.
      expect(typeof handle.hasRef === "function" ? handle.hasRef() : false).toBe(false);
    } finally {
      clearInterval(handle);
    }
  });
});
