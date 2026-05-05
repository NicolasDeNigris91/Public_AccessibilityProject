import { auditDeadLetterTotal } from "@/infrastructure/metrics/registry";
import { moveToDeadLetterIfFinal, type DeadLetterJobLike, type DeadLetterQueueLike } from "./dlq";

function loggerStub() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

function deadQueueStub(): DeadLetterQueueLike & { add: jest.Mock } {
  return { add: jest.fn().mockResolvedValue(undefined) };
}

async function readDlqCount(reason: string): Promise<number> {
  const obj = (await auditDeadLetterTotal.get()) as {
    values: Array<{ value: number; labels: Record<string, string> }>;
  };
  const sample = obj.values.find((v) => v.labels.reason === reason);
  return sample?.value ?? 0;
}

describe("moveToDeadLetterIfFinal", () => {
  beforeEach(() => {
    auditDeadLetterTotal.reset();
  });

  const baseJob: DeadLetterJobLike = {
    id: "j-1",
    data: { publicId: "p-1", url: "https://target.example", requestId: "r-1" },
    attemptsMade: 2,
    opts: { attempts: 2 },
  };

  it("moves the job and increments the metric on the final attempt", async () => {
    const deadQueue = deadQueueStub();
    const before = await readDlqCount("other");
    const out = await moveToDeadLetterIfFinal(baseJob, new Error("boom"), {
      deadQueue,
      logger: loggerStub(),
      now: () => new Date("2026-05-05T10:00:00Z"),
    });
    expect(out).toBe("moved");
    expect(deadQueue.add).toHaveBeenCalledWith(
      "dead-letter",
      {
        publicId: "p-1",
        url: "https://target.example",
        requestId: "r-1",
        failedAt: "2026-05-05T10:00:00.000Z",
        errorMessage: "boom",
        attemptsMade: 2,
      },
      { jobId: "dead:p-1" }
    );
    expect((await readDlqCount("other")) - before).toBe(1);
  });

  it("uses an idempotent jobId so a duplicate failed-event cannot double-write", async () => {
    const deadQueue = deadQueueStub();
    await moveToDeadLetterIfFinal(baseJob, new Error("boom"), {
      deadQueue,
      logger: loggerStub(),
    });
    expect(deadQueue.add.mock.calls[0]?.[2]).toEqual({ jobId: "dead:p-1" });
  });

  it("skips when attemptsMade is below the configured attempts (retry still pending)", async () => {
    const deadQueue = deadQueueStub();
    const out = await moveToDeadLetterIfFinal(
      { ...baseJob, attemptsMade: 1 },
      new Error("first try"),
      { deadQueue, logger: loggerStub() }
    );
    expect(out).toBe("retry-pending");
    expect(deadQueue.add).not.toHaveBeenCalled();
    expect(await readDlqCount("other")).toBe(0);
  });

  it("treats missing opts.attempts as 1 (single-attempt jobs)", async () => {
    const deadQueue = deadQueueStub();
    const out = await moveToDeadLetterIfFinal(
      { ...baseJob, attemptsMade: 1, opts: undefined },
      new Error("boom"),
      { deadQueue, logger: loggerStub() }
    );
    expect(out).toBe("moved");
    expect(deadQueue.add).toHaveBeenCalledTimes(1);
  });

  it("classifies error messages into low-cardinality reason labels", async () => {
    const cases: Array<[string, string]> = [
      ["page load timeout", "timeout"],
      ["net::ERR_CONNECTION_RESET", "network"],
      ["DNS lookup failed", "network"],
      ["unsafe_target", "ssrf"],
      ["browser disconnected", "browser_crash"],
      ["renderer crashed", "browser_crash"],
      ["something completely else", "other"],
    ];
    for (const [message, reason] of cases) {
      auditDeadLetterTotal.reset();
      const deadQueue = deadQueueStub();
      await moveToDeadLetterIfFinal(baseJob, new Error(message), {
        deadQueue,
        logger: loggerStub(),
      });
      expect(await readDlqCount(reason)).toBe(1);
    }
  });

  it("logs and swallows errors from the deadQueue.add (worker must not crash)", async () => {
    const deadQueue: DeadLetterQueueLike & { add: jest.Mock } = {
      add: jest.fn().mockRejectedValue(new Error("redis is down")),
    };
    const logger = loggerStub();
    const out = await moveToDeadLetterIfFinal(baseJob, new Error("boom"), {
      deadQueue,
      logger,
    });
    expect(out).toBe("skipped");
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(await readDlqCount("other")).toBe(0);
  });

  it("handles an undefined job (BullMQ edge case) by logging once and returning skipped", async () => {
    const deadQueue = deadQueueStub();
    const logger = loggerStub();
    const out = await moveToDeadLetterIfFinal(undefined, new Error("boom"), {
      deadQueue,
      logger,
    });
    expect(out).toBe("skipped");
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(deadQueue.add).not.toHaveBeenCalled();
  });

  it("falls back to 'unknown error' when the error has no message", async () => {
    const deadQueue = deadQueueStub();
    await moveToDeadLetterIfFinal(baseJob, undefined, {
      deadQueue,
      logger: loggerStub(),
    });
    expect(deadQueue.add.mock.calls[0]?.[1]).toMatchObject({
      errorMessage: "unknown error",
    });
  });
});
