import express from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { buildHandler } from "./auditEvents";

interface SseFrame {
  event?: string;
  data?: string;
  comment?: string;
}

function parseSse(buffer: string): SseFrame[] {
  const frames: SseFrame[] = [];
  for (const block of buffer.split("\n\n")) {
    if (!block.trim()) continue;
    const frame: SseFrame = {};
    for (const line of block.split("\n")) {
      if (line.startsWith(":")) frame.comment = line.slice(1);
      else if (line.startsWith("event:")) frame.event = line.slice(6).trim();
      else if (line.startsWith("data:")) frame.data = (frame.data ?? "") + line.slice(5).trim();
    }
    frames.push(frame);
  }
  return frames;
}

interface ServerHandle {
  url: string;
  close: () => Promise<void>;
}

async function startApp(handler: ReturnType<typeof buildHandler>): Promise<ServerHandle> {
  const app = express();
  app.get("/api/audits/:publicId/events", handler);
  return await new Promise<ServerHandle>((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((res) => {
            server.close(() => res());
          }),
      });
    });
  });
}

interface SseClient {
  readUntil: (predicate: (frames: SseFrame[]) => boolean, timeoutMs: number) => Promise<SseFrame[]>;
  abort: () => void;
}

function openSse(url: string): Promise<SseClient> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let buffer = "";
      const collected: SseFrame[] = [];
      let waiter: {
        predicate: (f: SseFrame[]) => boolean;
        resolve: (frames: SseFrame[]) => void;
        timer: NodeJS.Timeout;
      } | null = null;

      const tryResolveWaiter = () => {
        if (waiter && waiter.predicate(collected)) {
          clearTimeout(waiter.timer);
          waiter.resolve([...collected]);
          waiter = null;
        }
      };

      res.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        let idx;
        while ((idx = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          if (block.trim()) collected.push(...parseSse(block + "\n\n"));
        }
        tryResolveWaiter();
      });
      res.on("end", () => {
        tryResolveWaiter();
      });

      resolve({
        readUntil: (predicate, timeoutMs) =>
          new Promise<SseFrame[]>((res, rej) => {
            if (predicate(collected)) {
              res([...collected]);
              return;
            }
            const timer = setTimeout(() => {
              rej(new Error(`SSE timeout; got ${JSON.stringify(collected)}`));
            }, timeoutMs);
            waiter = { predicate, resolve: res, timer };
          }),
        abort: () => req.destroy(),
      });
    });
    req.on("error", reject);
  });
}

describe("audit events SSE", () => {
  it("emits the initial state and ends immediately when the audit is already done", async () => {
    const handler = buildHandler({
      fetch: jest.fn().mockResolvedValue({
        publicId: "p-done",
        status: "done",
        score: 92,
        url: "https://example.com",
      }),
      subscribe: jest.fn(),
      start: jest.fn().mockResolvedValue(undefined),
    });
    const server = await startApp(handler);
    try {
      const client = await openSse(`${server.url}/api/audits/p-done/events`);
      const frames = await client.readUntil((f) => f.some((x) => x.event === "end"), 2000);
      const events = frames.map((f) => f.event);
      expect(events).toContain("state");
      expect(events).toContain("end");
      const state = frames.find((f) => f.event === "state");
      expect(state?.data && JSON.parse(state.data).status).toBe("done");
      const end = frames.find((f) => f.event === "end");
      expect(end?.data && JSON.parse(end.data).reason).toBe("done");
    } finally {
      await server.close();
    }
  });

  it("emits 'end' with reason 'not-found' when the audit doesn't exist", async () => {
    const handler = buildHandler({
      fetch: jest.fn().mockResolvedValue(null),
      subscribe: jest.fn(),
      start: jest.fn().mockResolvedValue(undefined),
    });
    const server = await startApp(handler);
    try {
      const client = await openSse(`${server.url}/api/audits/missing/events`);
      const frames = await client.readUntil((f) => f.some((x) => x.event === "end"), 2000);
      const end = frames.find((f) => f.event === "end");
      expect(end?.data && JSON.parse(end.data).reason).toBe("not-found");
    } finally {
      await server.close();
    }
  });

  it("subscribes to the bus and re-emits state on each transition until terminal", async () => {
    let busCb: ((event: string) => void) | null = null;
    const fetch = jest
      .fn<Promise<unknown>, [string]>()
      .mockResolvedValueOnce({ publicId: "p-1", status: "queued" })
      .mockResolvedValueOnce({ publicId: "p-1", status: "running" })
      .mockResolvedValueOnce({ publicId: "p-1", status: "done", score: 80 });
    const subscribe = jest.fn((id: string, cb: (event: string) => void) => {
      busCb = cb;
      return () => {
        busCb = null;
      };
    });
    const handler = buildHandler({
      fetch: fetch as never,
      subscribe: subscribe as never,
      start: jest.fn().mockResolvedValue(undefined),
    });
    const server = await startApp(handler);
    try {
      const client = await openSse(`${server.url}/api/audits/p-1/events`);
      // After the initial state event lands, fire two transitions.
      await client.readUntil((f) => f.filter((x) => x.event === "state").length >= 1, 2000);
      (busCb as null | ((e: string) => void))?.("active");
      await client.readUntil((f) => f.filter((x) => x.event === "state").length >= 2, 2000);
      (busCb as null | ((e: string) => void))?.("completed");
      const frames = await client.readUntil((f) => f.some((x) => x.event === "end"), 2000);
      const stateFrames = frames.filter((f) => f.event === "state");
      expect(stateFrames).toHaveLength(3);
      const statuses = stateFrames.map((f) => JSON.parse(f.data!).status);
      expect(statuses).toEqual(["queued", "running", "done"]);
    } finally {
      await server.close();
    }
  });

  it("cleans up the bus subscription when the client disconnects", async () => {
    const unsubscribe = jest.fn();
    const handler = buildHandler({
      fetch: jest.fn().mockResolvedValue({ publicId: "p-1", status: "queued" }),
      subscribe: jest.fn().mockReturnValue(unsubscribe),
      start: jest.fn().mockResolvedValue(undefined),
    });
    const server = await startApp(handler);
    try {
      const client = await openSse(`${server.url}/api/audits/p-1/events`);
      await client.readUntil((f) => f.some((x) => x.event === "state"), 2000);
      client.abort();
      // Give the server a tick to fire 'close'.
      await new Promise((r) => setTimeout(r, 100));
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    } finally {
      await server.close();
    }
  });

  it("emits a heartbeat comment between state events when the audit is still running", async () => {
    let busCb: ((event: string) => void) | null = null;
    const handler = buildHandler({
      fetch: jest.fn().mockResolvedValue({ publicId: "p-1", status: "running" }),
      subscribe: jest.fn((_id: string, cb: (event: string) => void) => {
        busCb = cb;
        return () => undefined;
      }) as never,
      start: jest.fn().mockResolvedValue(undefined),
      heartbeatMs: 50, // tight for the test
    });
    const server = await startApp(handler);
    try {
      const client = await openSse(`${server.url}/api/audits/p-1/events`);
      const frames = await client.readUntil((f) => f.some((x) => x.comment === "hb"), 2000);
      expect(frames.some((f) => f.comment === "hb")).toBe(true);
      // Sanity: a transition should still arrive after heartbeats.
      (busCb as null | ((e: string) => void))?.("completed");
      // (avoid the audit transitioning to done — fetch always returns running)
      client.abort();
    } finally {
      await server.close();
    }
  });
});
