import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import cookieParser from "cookie-parser";
import { UserModel } from "@/infrastructure/db/UserModel";
import { SessionModel } from "@/infrastructure/db/SessionModel";
import { generateToken, hashToken } from "@/infrastructure/auth/tokens";
import { SESSION_COOKIE_NAME } from "@/infrastructure/auth/cookies";
import { optionalSession } from "./optionalSession";
import { requireSession } from "./requireSession";
import { errorHandler } from "./errorHandler";
import { requestId } from "./requestId";

describe("session middlewares", () => {
  let mongo: MongoMemoryServer;
  let app: express.Express;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(async () => {
    await Promise.all([UserModel.deleteMany({}), SessionModel.deleteMany({})]);
    app = express();
    app.use(requestId);
    app.use(cookieParser());
    app.use(optionalSession);
    app.get("/open", (req, res) => {
      res.json({ userId: req.userId ?? null, userEmail: req.userEmail ?? null });
    });
    app.get("/closed", requireSession, (req, res) => {
      res.json({ userId: req.userId, userEmail: req.userEmail });
    });
    app.use(errorHandler);
  });

  async function seedSession(): Promise<{ raw: string; userId: string }> {
    const u = await UserModel.create({ email: "a@b.com" });
    const raw = generateToken();
    await SessionModel.create({
      tokenHash: hashToken(raw),
      userId: u._id,
      expiresAt: new Date(Date.now() + 60_000),
    });
    return { raw, userId: (u._id as { toString(): string }).toString() };
  }

  it("optionalSession is a no-op without a cookie", async () => {
    const r = await request(app).get("/open");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ userId: null, userEmail: null });
  });

  it("optionalSession does not populate when cookie value is unknown", async () => {
    const r = await request(app)
      .get("/open")
      .set("Cookie", `${SESSION_COOKIE_NAME}=${generateToken()}`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ userId: null, userEmail: null });
  });

  it("optionalSession populates req.userId/req.userEmail when cookie is valid", async () => {
    const { raw, userId } = await seedSession();
    const r = await request(app).get("/open").set("Cookie", `${SESSION_COOKIE_NAME}=${raw}`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ userId, userEmail: "a@b.com" });
  });

  it("requireSession returns 401 with unauthorized envelope when no cookie", async () => {
    const r = await request(app).get("/closed");
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("unauthorized");
    expect(typeof r.body.requestId).toBe("string");
  });

  it("requireSession returns 401 when cookie is unknown/expired", async () => {
    const r = await request(app)
      .get("/closed")
      .set("Cookie", `${SESSION_COOKIE_NAME}=${generateToken()}`);
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("unauthorized");
  });

  it("requireSession passes through with a valid cookie", async () => {
    const { raw, userId } = await seedSession();
    const r = await request(app).get("/closed").set("Cookie", `${SESSION_COOKIE_NAME}=${raw}`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ userId, userEmail: "a@b.com" });
  });
});
