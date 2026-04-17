import "express-async-errors";
import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

// Route integration tests against a real Mongoose connection backed by an
// in-memory Mongo binary. Queue and safety-url modules stay mocked because
// exercising them needs Redis and the network respectively; both have their
// own unit tests. Everything else (schema, indexes, persistence) runs for
// real so a broken Mongoose query would surface here.

jest.mock("@/infrastructure/queue/auditQueue", () => ({
  auditQueue: { add: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock("@/application/assertSafeUrl", () => {
  const actual = jest.requireActual("@/application/assertSafeUrl");
  return {
    ...actual,
    assertSafeUrl: jest.fn().mockResolvedValue(undefined),
  };
});

import { AuditModel } from "@/infrastructure/db/AuditModel";
import { auditsRouter } from "./audits";
import { errorHandler } from "../middlewares/errorHandler";

const VALID_ID = "550e8400-e29b-41d4-a716-446655440000";
const OTHER_ID = "11111111-1111-4111-8111-111111111111";

let mongo: MongoMemoryServer;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/audits", auditsRouter);
  app.use(errorHandler);
  return app;
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { autoIndex: false });
  await AuditModel.syncIndexes();
}, 60_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

afterEach(async () => {
  await AuditModel.deleteMany({});
});

describe("POST /api/audits (integration)", () => {
  it("persists the audit document with queued status", async () => {
    const res = await request(buildApp())
      .post("/api/audits")
      .set("X-Client-Id", VALID_ID)
      .send({ url: "https://example.com" });

    expect(res.status).toBe(202);
    const { publicId } = res.body as { publicId: string };
    const stored = await AuditModel.findOne({ publicId }).lean();
    expect(stored).toMatchObject({
      publicId,
      clientId: VALID_ID,
      url: "https://example.com",
      status: "queued",
    });
    expect(stored?.createdAt).toBeInstanceOf(Date);
  });
});

describe("GET /api/audits/:publicId (integration)", () => {
  it("returns the stored audit for a known publicId", async () => {
    await AuditModel.create({
      publicId: "known-id",
      clientId: VALID_ID,
      url: "https://stored.example",
      status: "done",
      score: 92,
      totals: { critical: 0, serious: 1, moderate: 0, minor: 2 },
      violations: [],
      passes: 47,
      durationMs: 1234,
    });

    const res = await request(buildApp()).get("/api/audits/known-id");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      publicId: "known-id",
      url: "https://stored.example",
      status: "done",
      score: 92,
    });
  });

  it("404s for an unknown publicId with the envelope shape", async () => {
    const res = await request(buildApp()).get("/api/audits/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      error: { code: "not_found" },
    });
  });
});

describe("GET /api/audits (integration)", () => {
  it("scopes the list to the caller's clientId", async () => {
    await AuditModel.create([
      {
        publicId: "a",
        clientId: VALID_ID,
        url: "https://a.example",
        status: "done",
      },
      {
        publicId: "b",
        clientId: VALID_ID,
        url: "https://b.example",
        status: "done",
      },
      {
        publicId: "c",
        clientId: OTHER_ID,
        url: "https://c.example",
        status: "done",
      },
    ]);

    const mine = await request(buildApp())
      .get("/api/audits")
      .set("X-Client-Id", VALID_ID);
    const theirs = await request(buildApp())
      .get("/api/audits")
      .set("X-Client-Id", OTHER_ID);

    expect(mine.status).toBe(200);
    expect(mine.body.map((a: { publicId: string }) => a.publicId).sort()).toEqual(
      ["a", "b"]
    );
    expect(theirs.body.map((a: { publicId: string }) => a.publicId)).toEqual(["c"]);
  });

  it("orders results newest-first", async () => {
    const now = Date.now();
    await AuditModel.create([
      {
        publicId: "old",
        clientId: VALID_ID,
        url: "https://old.example",
        status: "done",
        createdAt: new Date(now - 10_000),
      },
      {
        publicId: "new",
        clientId: VALID_ID,
        url: "https://new.example",
        status: "done",
        createdAt: new Date(now),
      },
    ]);

    const res = await request(buildApp())
      .get("/api/audits")
      .set("X-Client-Id", VALID_ID);

    expect(res.body.map((a: { publicId: string }) => a.publicId)).toEqual([
      "new",
      "old",
    ]);
  });

  it("caps results at 50 so a runaway client cannot pull the whole collection", async () => {
    const docs = Array.from({ length: 75 }, (_, i) => ({
      publicId: `id-${i}`,
      clientId: VALID_ID,
      url: `https://n${i}.example`,
      status: "done" as const,
    }));
    await AuditModel.create(docs);

    const res = await request(buildApp())
      .get("/api/audits")
      .set("X-Client-Id", VALID_ID);

    expect(res.body).toHaveLength(50);
  });
});
