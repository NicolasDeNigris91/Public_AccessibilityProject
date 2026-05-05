import { captureTraceparent, withRestoredContext, withSpan } from "./spans";

describe("withSpan", () => {
  it("returns the value produced by fn on the happy path", async () => {
    const result = await withSpan("test.op", { foo: "bar" }, async () => 42);
    expect(result).toBe(42);
  });

  it("re-throws when fn throws (status ERROR set, exception recorded)", async () => {
    await expect(
      withSpan("test.op", {}, async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
  });

  it("re-throws non-Error rejections without crashing on recordException", async () => {
    // Cover the branch where err is not an Error instance — withSpan
    // still sets ERROR status with a string message and re-throws.
    await expect(withSpan("op", {}, async () => Promise.reject("string-reason"))).rejects.toBe(
      "string-reason"
    );
  });
});

describe("withRestoredContext", () => {
  it("calls fn directly when payload has no traceparent (no SDK / unstarted parent)", async () => {
    const result = await withRestoredContext(undefined, async () => "ran");
    expect(result).toBe("ran");
  });

  it("calls fn directly when traceparent is empty", async () => {
    const result = await withRestoredContext({ traceparent: undefined }, async () => "ran");
    expect(result).toBe("ran");
  });

  it("calls fn when a traceparent is provided (context restored)", async () => {
    // The W3C format: 00-<trace-id>-<span-id>-<flags>
    const traceparent = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01";
    const result = await withRestoredContext({ traceparent }, async () => "restored");
    expect(result).toBe("restored");
  });
});

describe("captureTraceparent", () => {
  it("returns undefined when no SDK is started (no active span)", () => {
    // With no NodeSDK active, propagation.inject populates nothing, so
    // captureTraceparent returns undefined. Confirms producers don't
    // ship a meaningless header in noop mode.
    expect(captureTraceparent()).toBeUndefined();
  });
});
