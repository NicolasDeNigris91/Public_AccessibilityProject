import "express-async-errors";
import express from "express";
import request from "supertest";
import { Redis } from "ioredis";
import RedisMock from "ioredis-mock";
import { clientIdRateLimit } from "./clientIdRateLimit";
import { errorHandler, AppError } from "./errorHandler";

const VALID_ID = "550e8400-e29b-41d4-a716-446655440000";

function buildApp(redis: Redis, max: number, windowMs = 60_000) {
  const app = express();
  // Stub clientId middleware: trust X-Client-Id when present.
  app.use((req, _res, next) => {
    const id = req.header("X-Client-Id");
    if (!id) {
      next(new AppError(400, "invalid_client_id"));
      return;
    }
    req.clientId = id;
    next();
  });
  app.use(clientIdRateLimit({ redis, max, windowMs, keyPrefix: "test:rl" }));
  app.post("/x", (_req, res) => res.status(202).json({ ok: true }));
  app.use(errorHandler);
  return app;
}

describe("clientIdRateLimit", () => {
  let redis: Redis;
  beforeEach(async () => {
    redis = new RedisMock() as unknown as Redis;
    // ioredis-mock shares state across instances within a process; reset
    // to prevent bleed between tests.
    await redis.flushall();
  });
  afterEach(async () => {
    await redis.quit();
  });

  it("allows up to max within the window then 429s", async () => {
    const app = buildApp(redis, 3);
    const headers = { "X-Client-Id": VALID_ID };

    for (let i = 0; i < 3; i++) {
      const res = await request(app).post("/x").set(headers);
      expect(res.status).toBe(202);
    }
    const blocked = await request(app).post("/x").set(headers);
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ error: { code: "rate_limited_per_client" } });
  });

  it("scopes the counter by clientId", async () => {
    const app = buildApp(redis, 1);
    const a = await request(app).post("/x").set("X-Client-Id", VALID_ID);
    const b = await request(app)
      .post("/x")
      .set("X-Client-Id", "11111111-1111-4111-8111-111111111111");
    expect(a.status).toBe(202);
    expect(b.status).toBe(202);
  });

  it("calls next with AppError(400, invalid_client_id) when req.clientId is missing", async () => {
    // Defense in depth: if the route forgets to mount requireClientId
    // first, the rate limiter must refuse rather than rate-limit a
    // shared/empty key.
    const handler = clientIdRateLimit({
      redis: new RedisMock() as unknown as Redis,
      windowMs: 60_000,
      max: 1,
      keyPrefix: "test:no-client",
    });
    const next = jest.fn();
    await handler({} as Parameters<typeof handler>[0], {} as Parameters<typeof handler>[1], next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0]?.[0];
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(400);
    expect((err as AppError).code).toBe("invalid_client_id");
  });

  it("fails open if redis is unreachable", async () => {
    const broken = {
      multi: () => ({
        zremrangebyscore: () => ({}),
        zcard: () => ({}),
        zadd: () => ({}),
        pexpire: () => ({}),
        exec: jest.fn().mockRejectedValue(new Error("redis is gone")),
      }),
    } as unknown as Redis;
    const app = buildApp(broken, 1);
    const res = await request(app).post("/x").set("X-Client-Id", VALID_ID);
    expect(res.status).toBe(202);
  });
});
