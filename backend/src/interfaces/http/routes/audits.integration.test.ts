import "express-async-errors";
import express from "express";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

// Real Mongoose against an in-memory Mongo. Queue and safety-url stay mocked
// (they need Redis / the network and have their own unit tests).

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

jest.mock("../middlewares/clientIdRateLimit", () => ({
  clientIdRateLimit: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock("@/infrastructure/queue/connection", () => ({ redisConnection: {} }));

import { AuditModel } from "@/infrastructure/db/AuditModel";
import { auditsRouter } from "./audits";
import { errorHandler } from "../middlewares/errorHandler";
import { AuditAcceptedZ, AuditDetailZ, AuditListZ, ErrorEnvelopeZ } from "@/domain/contracts";

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

  it("returns 404 envelope for unknown publicId", async () => {
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

    const mine = await request(buildApp()).get("/api/audits").set("X-Client-Id", VALID_ID);
    const theirs = await request(buildApp()).get("/api/audits").set("X-Client-Id", OTHER_ID);

    expect(mine.status).toBe(200);
    expect(mine.body.map((a: { publicId: string }) => a.publicId).sort()).toEqual(["a", "b"]);
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

    const res = await request(buildApp()).get("/api/audits").set("X-Client-Id", VALID_ID);

    expect(res.body.map((a: { publicId: string }) => a.publicId)).toEqual(["new", "old"]);
  });

  it("caps results at 50", async () => {
    const docs = Array.from({ length: 75 }, (_, i) => ({
      publicId: `id-${i}`,
      clientId: VALID_ID,
      url: `https://n${i}.example`,
      status: "done" as const,
    }));
    await AuditModel.create(docs);

    const res = await request(buildApp()).get("/api/audits").set("X-Client-Id", VALID_ID);

    expect(res.body).toHaveLength(50);
  });
});

// Contract tests: every documented response shape must validate against the
// Zod schemas in domain/contracts.ts. Schema drift breaks the build before
// it reaches the frontend.
describe("response contracts", () => {
  it("POST /api/audits 202 matches AuditAccepted schema", async () => {
    const res = await request(buildApp())
      .post("/api/audits")
      .set("X-Client-Id", VALID_ID)
      .send({ url: "https://example.com" });
    expect(res.status).toBe(202);
    expect(() => AuditAcceptedZ.parse(res.body)).not.toThrow();
  });

  it("GET /api/audits/:publicId 200 matches AuditDetail schema (done audit)", async () => {
    await AuditModel.create({
      publicId: "contract-done",
      clientId: VALID_ID,
      url: "https://contract.example",
      status: "done",
      score: 88,
      totals: { critical: 1, serious: 2, moderate: 0, minor: 3 },
      violations: [
        {
          id: "color-contrast",
          impact: "serious",
          description: "x",
          helpUrl: "https://example.com/h",
          tags: ["wcag2aa"],
          nodes: [{ target: ["button"], html: "<button/>" }],
        },
      ],
      passes: 42,
      durationMs: 1200,
    });
    const res = await request(buildApp()).get("/api/audits/contract-done");
    expect(res.status).toBe(200);
    expect(() => AuditDetailZ.parse(res.body)).not.toThrow();
  });

  it("GET /api/audits 200 matches AuditList schema", async () => {
    await AuditModel.create([
      { publicId: "x1", clientId: VALID_ID, url: "https://x1.example", status: "done" },
      { publicId: "x2", clientId: VALID_ID, url: "https://x2.example", status: "queued" },
    ]);
    const res = await request(buildApp()).get("/api/audits").set("X-Client-Id", VALID_ID);
    expect(res.status).toBe(200);
    expect(() => AuditListZ.parse(res.body)).not.toThrow();
  });

  it("non-2xx responses match the ErrorEnvelope schema", async () => {
    const missing = await request(buildApp()).get("/api/audits/no-such-id");
    expect(missing.status).toBe(404);
    expect(() => ErrorEnvelopeZ.parse(missing.body)).not.toThrow();

    const noClient = await request(buildApp()).get("/api/audits");
    expect(noClient.status).toBe(400);
    expect(() => ErrorEnvelopeZ.parse(noClient.body)).not.toThrow();
  });
});
