import express, { Router } from "express";
import request from "supertest";

// We don't need to test the Bull-Board library itself — only that we
// mount it behind basic auth at the right path, with both queues, and
// that the route is gated on the env pair. So the upstream modules
// are stubbed: BullMQAdapter is identity, createBullBoard is a noop,
// ExpressAdapter exposes a router that 200s on the base path so we
// can verify the auth gate gives way once creds are valid.
jest.mock("@bull-board/api", () => ({
  createBullBoard: jest.fn(),
}));
jest.mock("@bull-board/api/bullMQAdapter", () => ({
  BullMQAdapter: jest.fn().mockImplementation((q: { name: string }) => ({
    name: q.name,
  })),
}));
jest.mock("@bull-board/express", () => {
  return {
    ExpressAdapter: jest.fn().mockImplementation(() => {
      const router = Router();
      router.get("/", (_req, res) => res.status(200).send("bull-board-stub"));
      return {
        setBasePath: jest.fn(),
        getRouter: () => router,
      };
    }),
  };
});

jest.mock("@/infrastructure/queue/auditQueue", () => ({
  auditQueue: { name: "audits" },
  auditDeadQueue: { name: "audits-dead" },
}));

import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { mountQueuesUI } from "./queuesUI";

function authHeader(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`, "utf8").toString("base64")}`;
}

describe("mountQueuesUI", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns false and does not mount when ADMIN_USER is missing", () => {
    const app = express();
    const mounted = mountQueuesUI(app, { user: undefined, pass: "supersecret" });
    expect(mounted).toBe(false);
  });

  it("returns false and does not mount when ADMIN_PASS is missing", () => {
    const app = express();
    const mounted = mountQueuesUI(app, { user: "admin", pass: undefined });
    expect(mounted).toBe(false);
  });

  it("returns false and does not mount when both are missing", () => {
    const app = express();
    const mounted = mountQueuesUI(app, { user: undefined, pass: undefined });
    expect(mounted).toBe(false);
  });

  it("mounts behind basic auth when both creds are set: returns 401 without auth", async () => {
    const app = express();
    const mounted = mountQueuesUI(app, { user: "admin", pass: "supersecret" });
    expect(mounted).toBe(true);
    const res = await request(app).get("/admin/queues");
    expect(res.status).toBe(401);
    expect(res.headers["www-authenticate"]).toBe('Basic realm="Bull-Board"');
  });

  it("rejects wrong credentials with 401", async () => {
    const app = express();
    mountQueuesUI(app, { user: "admin", pass: "supersecret" });
    const res = await request(app)
      .get("/admin/queues")
      .set("authorization", authHeader("admin", "WRONG"));
    expect(res.status).toBe(401);
  });

  it("accepts correct credentials and reaches the Bull-Board router", async () => {
    const app = express();
    mountQueuesUI(app, { user: "admin", pass: "supersecret" });
    const res = await request(app)
      .get("/admin/queues")
      .set("authorization", authHeader("admin", "supersecret"));
    expect(res.status).toBe(200);
    expect(res.text).toBe("bull-board-stub");
  });

  it("registers BOTH the live and dead-letter queues with Bull-Board", () => {
    const app = express();
    mountQueuesUI(app, { user: "admin", pass: "supersecret" });
    expect(BullMQAdapter).toHaveBeenCalledTimes(2);
    expect(createBullBoard).toHaveBeenCalledWith(
      expect.objectContaining({
        queues: [
          expect.objectContaining({ name: "audits" }),
          expect.objectContaining({ name: "audits-dead" }),
        ],
      })
    );
  });
});
