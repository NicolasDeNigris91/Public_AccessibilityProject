import { EventEmitter } from "node:events";
import { _peekSubscriberCount, _reset, start, stop, subscribe } from "./auditEventsBus";

class FakeQueueEvents extends EventEmitter {
  closed = false;
  async waitUntilReady(): Promise<void> {
    /* noop */
  }
  async close(): Promise<void> {
    this.closed = true;
  }
}

function fakeFactory(): { instance: FakeQueueEvents; build: () => FakeQueueEvents } {
  const instance = new FakeQueueEvents();
  return { instance, build: () => instance };
}

describe("auditEventsBus", () => {
  beforeEach(() => {
    _reset();
  });

  afterEach(async () => {
    await stop();
  });

  it("dispatches BullMQ active/progress/completed/failed events to subscribers by jobId", async () => {
    const { instance, build } = fakeFactory();
    await start({ factory: build as never });

    const seen: Array<[string, string]> = [];
    const unsub = subscribe("p-1", (event) => seen.push(["p-1", event]));
    subscribe("p-2", (event) => seen.push(["p-2", event]));

    instance.emit("active", { jobId: "p-1" });
    instance.emit("progress", { jobId: "p-1" });
    instance.emit("completed", { jobId: "p-1" });
    instance.emit("failed", { jobId: "p-2" });
    // Foreign jobId — ignored.
    instance.emit("completed", { jobId: "stranger" });

    expect(seen).toEqual([
      ["p-1", "active"],
      ["p-1", "progress"],
      ["p-1", "completed"],
      ["p-2", "failed"],
    ]);

    unsub();
    expect(_peekSubscriberCount("p-1")).toBe(0);
  });

  it("supports multiple subscribers for the same publicId", async () => {
    const { instance, build } = fakeFactory();
    await start({ factory: build as never });

    const a: string[] = [];
    const b: string[] = [];
    subscribe("p-1", (event) => a.push(event));
    subscribe("p-1", (event) => b.push(event));

    instance.emit("completed", { jobId: "p-1" });
    expect(a).toEqual(["completed"]);
    expect(b).toEqual(["completed"]);
  });

  it("does not dispatch when jobId is missing on the event payload", async () => {
    const { instance, build } = fakeFactory();
    await start({ factory: build as never });

    let called = 0;
    subscribe("p-1", () => {
      called++;
    });
    instance.emit("completed", {});
    expect(called).toBe(0);
  });

  it("a subscriber that throws does not block other subscribers", async () => {
    const { instance, build } = fakeFactory();
    await start({ factory: build as never });

    const seen: string[] = [];
    subscribe("p-1", () => {
      throw new Error("misbehaving");
    });
    subscribe("p-1", (event) => seen.push(event));
    instance.emit("active", { jobId: "p-1" });
    expect(seen).toEqual(["active"]);
  });

  it("unsubscribe removes only the right callback and cleans the entry when empty", async () => {
    const { build } = fakeFactory();
    await start({ factory: build as never });

    const cb1 = jest.fn();
    const cb2 = jest.fn();
    const off1 = subscribe("p-1", cb1);
    subscribe("p-1", cb2);
    expect(_peekSubscriberCount("p-1")).toBe(2);
    off1();
    expect(_peekSubscriberCount("p-1")).toBe(1);
    // Calling unsubscribe twice is a no-op (idempotent).
    off1();
    expect(_peekSubscriberCount("p-1")).toBe(1);
  });

  it("start is idempotent: calling twice doesn't create a second QueueEvents", async () => {
    let calls = 0;
    const factory = () => {
      calls++;
      return new FakeQueueEvents() as never;
    };
    await start({ factory });
    await start({ factory });
    await start({ factory });
    expect(calls).toBe(1);
  });

  it("stop closes the underlying QueueEvents and clears subscribers", async () => {
    const { instance, build } = fakeFactory();
    await start({ factory: build as never });
    subscribe("p-1", () => undefined);

    await stop();
    expect(instance.closed).toBe(true);
    expect(_peekSubscriberCount("p-1")).toBe(0);
  });
});
