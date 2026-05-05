import "express-async-errors";
import express from "express";
import request from "supertest";
import { Redis } from "ioredis";
import RedisMock from "ioredis-mock";
import { ipEmailRateLimit } from "./ipEmailRateLimit";
import { errorHandler } from "./errorHandler";

function buildApp(redis: Redis, max: number, windowMs = 60_000, ipHeader?: string) {
  const app = express();
  if (ipHeader) {
    // Pretend the request came from `ipHeader` so we can vary IP per test.
    app.use((req, _res, next) => {
      Object.defineProperty(req, "ip", { value: ipHeader });
      next();
    });
  }
  app.use(express.json());
  app.use(ipEmailRateLimit({ redis, max, windowMs, keyPrefix: "test:rl-ie" }));
  app.post("/m", (_req, res) => res.status(202).json({ ok: true }));
  app.use(errorHandler);
  return app;
}

describe("ipEmailRateLimit", () => {
  let redis: Redis;
  beforeEach(async () => {
    redis = new RedisMock() as unknown as Redis;
    await redis.flushall();
  });
  afterEach(async () => {
    await redis.quit();
  });

  it("allows up to max requests for the same ip+email then 429s", async () => {
    const app = buildApp(redis, 3);
    for (let i = 0; i < 3; i++) {
      const ok = await request(app).post("/m").send({ email: "a@b.com" });
      expect(ok.status).toBe(202);
    }
    const blocked = await request(app).post("/m").send({ email: "a@b.com" });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("rate_limited_per_ip_email");
  });

  it("scopes by email — same ip, different email starts a new bucket", async () => {
    const app = buildApp(redis, 1);
    const first = await request(app).post("/m").send({ email: "a@b.com" });
    const second = await request(app).post("/m").send({ email: "c@d.com" });
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
  });

  it("normalizes email casing and whitespace", async () => {
    const app = buildApp(redis, 1);
    const a = await request(app).post("/m").send({ email: "User@Example.com" });
    const b = await request(app).post("/m").send({ email: "  user@example.com  " });
    expect(a.status).toBe(202);
    expect(b.status).toBe(429);
  });

  it("scopes by ip — same email, different ip starts a new bucket", async () => {
    const app1 = buildApp(redis, 1, 60_000, "1.1.1.1");
    const app2 = buildApp(redis, 1, 60_000, "2.2.2.2");
    const a = await request(app1).post("/m").send({ email: "a@b.com" });
    const b = await request(app2).post("/m").send({ email: "a@b.com" });
    expect(a.status).toBe(202);
    expect(b.status).toBe(202);
  });

  it("skips when email body is missing (route 400 path takes over)", async () => {
    const app = buildApp(redis, 1);
    // No email sent at all — the limiter must not 429 before the route validates.
    const a = await request(app).post("/m").send({});
    const b = await request(app).post("/m").send({});
    expect(a.status).toBe(202);
    expect(b.status).toBe(202);
  });

  it("fails open if redis errors", async () => {
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
    const res = await request(app).post("/m").send({ email: "a@b.com" });
    expect(res.status).toBe(202);
  });
});
