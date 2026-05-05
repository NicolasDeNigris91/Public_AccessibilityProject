import "express-async-errors";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Redis } from "ioredis";
import RedisMock from "ioredis-mock";
import { UserModel } from "@/infrastructure/db/UserModel";
import { MagicLinkModel } from "@/infrastructure/db/MagicLinkModel";
import { SessionModel } from "@/infrastructure/db/SessionModel";
import { AuditModel } from "@/infrastructure/db/AuditModel";
import { FakeSender } from "@/infrastructure/email/fakeSender";
import { SESSION_COOKIE_NAME } from "@/infrastructure/auth/cookies";
import { errorHandler } from "@/interfaces/http/middlewares/errorHandler";
import { requestId } from "@/interfaces/http/middlewares/requestId";
import { optionalSession } from "@/interfaces/http/middlewares/optionalSession";
import { ipEmailRateLimit } from "@/interfaces/http/middlewares/ipEmailRateLimit";
import { buildAuthRouter, AuthRouterDeps } from "./auth";

interface BuildAppOpts {
  sender: AuthRouterDeps["sender"];
  cookieSecure?: boolean;
  cookieDomain?: string;
  lastLinkLookup?: AuthRouterDeps["lastLinkLookup"];
  magicLinkRateLimiter?: AuthRouterDeps["magicLinkRateLimiter"];
}

function buildApp(opts: BuildAppOpts): express.Express {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.use(cookieParser());
  app.use(optionalSession);
  app.use(
    "/api/auth",
    buildAuthRouter({
      sender: opts.sender,
      webBaseUrl: "https://api.test",
      appRedirectUrl: "https://web.test/app",
      cookieSecure: opts.cookieSecure ?? false,
      cookieMaxAgeSec: 30 * 86_400,
      ...(opts.cookieDomain ? { cookieDomain: opts.cookieDomain } : {}),
      magicLinkTtlMs: 15 * 60_000,
      sessionTtlMs: 30 * 86_400_000,
      ...(opts.lastLinkLookup ? { lastLinkLookup: opts.lastLinkLookup } : {}),
      ...(opts.magicLinkRateLimiter ? { magicLinkRateLimiter: opts.magicLinkRateLimiter } : {}),
    })
  );
  app.use(errorHandler);
  return app;
}

describe("authRouter", () => {
  let mongo: MongoMemoryServer;
  let app: express.Express;
  let sender: FakeSender;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });
  beforeEach(async () => {
    await Promise.all([
      UserModel.deleteMany({}),
      MagicLinkModel.deleteMany({}),
      SessionModel.deleteMany({}),
      AuditModel.deleteMany({}),
    ]);
    sender = new FakeSender();
    app = buildApp({ sender });
  });

  describe("POST /api/auth/magic-link", () => {
    it("202s + sends an email when sender is present", async () => {
      const r = await request(app).post("/api/auth/magic-link").send({ email: "a@b.com" });
      expect(r.status).toBe(202);
      expect(sender.inbox).toHaveLength(1);
      expect(sender.inbox[0]?.to).toBe("a@b.com");
      expect(sender.inbox[0]?.link).toMatch(/^https:\/\/api\.test\/api\/auth\/verify\?token=/);
    });

    it("400s on a malformed email", async () => {
      const r = await request(app).post("/api/auth/magic-link").send({ email: "not-an-email" });
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe("invalid_email");
    });

    it("503s with structured hint when sender is null (prod, no provider)", async () => {
      const localApp = buildApp({ sender: null, cookieSecure: true });
      const r = await request(localApp).post("/api/auth/magic-link").send({ email: "a@b.com" });
      expect(r.status).toBe(503);
      expect(r.body.error.code).toBe("auth/email-not-configured");
      expect(r.body.error.hint).toMatch(/EMAIL_PROVIDER/);
    });
  });

  describe("GET /api/auth/verify", () => {
    it("302s to appRedirectUrl with Set-Cookie when token is fresh", async () => {
      await request(app).post("/api/auth/magic-link").send({ email: "a@b.com" });
      const link = sender.inbox[0]?.link ?? "";
      const token = new URL(link).searchParams.get("token") ?? "";
      const r = await request(app).get(`/api/auth/verify?token=${token}`);
      expect(r.status).toBe(302);
      expect(r.headers.location).toBe("https://web.test/app");
      const setCookie = r.headers["set-cookie"]?.[0] ?? "";
      expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=Lax");
    });

    it("400s when token query is missing", async () => {
      const r = await request(app).get("/api/auth/verify");
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe("missing_token");
    });

    it("401s when token is unknown", async () => {
      const r = await request(app).get("/api/auth/verify?token=deadbeef");
      expect(r.status).toBe(401);
      expect(r.body.error.code).toBe("invalid_token");
    });

    it("401s + already_used when token is replayed", async () => {
      await request(app).post("/api/auth/magic-link").send({ email: "a@b.com" });
      const token = new URL(sender.inbox[0]?.link ?? "").searchParams.get("token") ?? "";
      await request(app).get(`/api/auth/verify?token=${token}`);
      const r = await request(app).get(`/api/auth/verify?token=${token}`);
      expect(r.status).toBe(401);
      expect(r.body.error.code).toBe("already_used");
    });

    it("merges anonymous audits with the matching X-Client-Id header on verify", async () => {
      await AuditModel.create({ publicId: "p1", url: "https://x", clientId: "cid-9" });
      await AuditModel.create({ publicId: "p2", url: "https://y", clientId: "cid-other" });
      await request(app).post("/api/auth/magic-link").send({ email: "a@b.com" });
      const token = new URL(sender.inbox[0]?.link ?? "").searchParams.get("token") ?? "";
      const r = await request(app)
        .get(`/api/auth/verify?token=${token}`)
        .set("X-Client-Id", "cid-9");
      expect(r.status).toBe(302);
      const matched = await AuditModel.findOne({ publicId: "p1" }).lean();
      expect(matched?.userId).toBeTruthy();
      const skipped = await AuditModel.findOne({ publicId: "p2" }).lean();
      expect(skipped?.userId).toBeFalsy();
    });
  });

  describe("GET /api/auth/me", () => {
    it("returns { user: null } when no cookie is present", async () => {
      const r = await request(app).get("/api/auth/me");
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ user: null });
    });

    it("returns { user: { id, email } } with a valid cookie", async () => {
      await request(app).post("/api/auth/magic-link").send({ email: "a@b.com" });
      const token = new URL(sender.inbox[0]?.link ?? "").searchParams.get("token") ?? "";
      const verify = await request(app).get(`/api/auth/verify?token=${token}`);
      const cookie = (verify.headers["set-cookie"]?.[0] ?? "").split(";")[0] ?? "";
      const me = await request(app).get("/api/auth/me").set("Cookie", cookie);
      expect(me.status).toBe(200);
      expect(me.body.user?.email).toBe("a@b.com");
      expect(me.body.user?.id).toBeTruthy();
    });
  });

  describe("POST /api/auth/logout", () => {
    it("clears the cookie and removes the session row", async () => {
      await request(app).post("/api/auth/magic-link").send({ email: "a@b.com" });
      const token = new URL(sender.inbox[0]?.link ?? "").searchParams.get("token") ?? "";
      const verify = await request(app).get(`/api/auth/verify?token=${token}`);
      const cookie = (verify.headers["set-cookie"]?.[0] ?? "").split(";")[0] ?? "";
      const r = await request(app).post("/api/auth/logout").set("Cookie", cookie);
      expect(r.status).toBe(204);
      const cleared = r.headers["set-cookie"]?.[0] ?? "";
      expect(cleared).toContain(`${SESSION_COOKIE_NAME}=`);
      expect(cleared).toContain("Max-Age=0");
      expect(await SessionModel.countDocuments()).toBe(0);
    });

    it("is a no-op when called without a cookie (still clears + 204)", async () => {
      const r = await request(app).post("/api/auth/logout");
      expect(r.status).toBe(204);
      expect(r.headers["set-cookie"]?.[0]).toContain("Max-Age=0");
    });
  });

  describe("GET /api/auth/__test/last-link", () => {
    it("is not mounted when lastLinkLookup is absent", async () => {
      const r = await request(app).get("/api/auth/__test/last-link?email=a@b.com");
      expect(r.status).toBe(404);
    });

    const lookupFromInbox =
      (s: FakeSender) =>
      (email: string): string | undefined =>
        [...s.inbox].reverse().find((m) => m.to === email)?.link;

    it("returns the latest link for a given email when lookup is wired", async () => {
      const inboxApp = buildApp({ sender, lastLinkLookup: lookupFromInbox(sender) });
      await request(inboxApp).post("/api/auth/magic-link").send({ email: "a@b.com" });
      const r = await request(inboxApp).get("/api/auth/__test/last-link?email=a@b.com");
      expect(r.status).toBe(200);
      expect(r.body.link).toMatch(/\/api\/auth\/verify\?token=/);
    });

    it("404s with { link: null } when no link has been sent yet", async () => {
      const inboxApp = buildApp({ sender, lastLinkLookup: lookupFromInbox(sender) });
      const r = await request(inboxApp).get("/api/auth/__test/last-link?email=ghost@b.com");
      expect(r.status).toBe(404);
      expect(r.body).toEqual({ link: null });
    });

    it("400s when email query is missing", async () => {
      const inboxApp = buildApp({ sender, lastLinkLookup: lookupFromInbox(sender) });
      const r = await request(inboxApp).get("/api/auth/__test/last-link");
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe("missing_email");
    });
  });

  describe("magic-link rate limit", () => {
    it("429s after exceeding the per-(ip, email) cap", async () => {
      const redis = new RedisMock() as unknown as Redis;
      await redis.flushall();
      const limited = buildApp({
        sender,
        magicLinkRateLimiter: ipEmailRateLimit({
          redis,
          max: 2,
          windowMs: 60_000,
          keyPrefix: "test:auth:rl",
        }),
      });
      for (let i = 0; i < 2; i++) {
        const ok = await request(limited).post("/api/auth/magic-link").send({ email: "a@b.com" });
        expect(ok.status).toBe(202);
      }
      const blocked = await request(limited)
        .post("/api/auth/magic-link")
        .send({ email: "a@b.com" });
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe("rate_limited_per_ip_email");
      await redis.quit();
    });
  });
});
