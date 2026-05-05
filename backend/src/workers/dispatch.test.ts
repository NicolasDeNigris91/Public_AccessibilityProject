import { processAuditJob, type AuditOutcome, type DispatchDeps } from "./dispatch";

const happyOutcome: AuditOutcome = {
  score: 92,
  totals: { critical: 0, serious: 1, moderate: 0, minor: 2 },
  passes: 47,
  durationMs: 1234,
};

function makeDeps(overrides: Partial<DispatchDeps> = {}): DispatchDeps {
  const child = { info: jest.fn(), error: jest.fn(), child: jest.fn() };
  // child().child() returns a fresh stub so chained .child calls work.
  const root = {
    info: jest.fn(),
    error: jest.fn(),
    child: jest.fn().mockReturnValue(child),
  };
  return {
    runAudit: jest.fn().mockResolvedValue(happyOutcome),
    model: { updateOne: jest.fn().mockResolvedValue({ acknowledged: true }) },
    logger: root as unknown as DispatchDeps["logger"],
    ...overrides,
  };
}

describe("processAuditJob", () => {
  it("runs the audit and persists running -> done", async () => {
    const deps = makeDeps();
    const out = await processAuditJob(
      { publicId: "p-1", url: "https://example.com", requestId: "req-1" },
      deps
    );
    expect(out).toEqual(happyOutcome);

    const updateOne = deps.model.updateOne as jest.Mock;
    expect(updateOne).toHaveBeenNthCalledWith(
      1,
      { publicId: "p-1" },
      { $set: { status: "running" } }
    );
    expect(updateOne).toHaveBeenNthCalledWith(
      2,
      { publicId: "p-1" },
      { $set: { status: "done", ...happyOutcome } }
    );
  });

  it("persists failed status with the error message and rethrows", async () => {
    const deps = makeDeps({
      runAudit: jest.fn().mockRejectedValue(new Error("page.goto timeout")),
    });
    await expect(
      processAuditJob({ publicId: "p-2", url: "https://x.example" }, deps)
    ).rejects.toThrow("page.goto timeout");

    const updateOne = deps.model.updateOne as jest.Mock;
    expect(updateOne).toHaveBeenNthCalledWith(
      2,
      { publicId: "p-2" },
      { $set: { status: "failed", error: "page.goto timeout" } }
    );
  });

  it("coerces non-Error rejections to a string for persistence", async () => {
    const deps = makeDeps({
      runAudit: jest.fn().mockRejectedValue("worker exploded"),
    });
    await expect(processAuditJob({ publicId: "p-3", url: "https://x.example" }, deps)).rejects.toBe(
      "worker exploded"
    );

    const updateOne = deps.model.updateOne as jest.Mock;
    expect(updateOne).toHaveBeenNthCalledWith(
      2,
      { publicId: "p-3" },
      { $set: { status: "failed", error: "worker exploded" } }
    );
  });

  it("falls back to 'unknown' requestId when none provided", async () => {
    const deps = makeDeps();
    await processAuditJob({ publicId: "p-4", url: "https://x.example" }, deps);
    expect(deps.logger.child).toHaveBeenCalledWith({
      requestId: "unknown",
      publicId: "p-4",
    });
  });

  it("does not mark done if persistence of running fails", async () => {
    const updateOne = jest.fn().mockRejectedValueOnce(new Error("mongo down"));
    const runAudit = jest.fn();
    const deps = makeDeps({
      model: { updateOne },
      runAudit,
    });
    await expect(
      processAuditJob({ publicId: "p-5", url: "https://x.example" }, deps)
    ).rejects.toThrow("mongo down");
    expect(runAudit).not.toHaveBeenCalled();
    expect(updateOne).toHaveBeenCalledTimes(1);
  });
});
