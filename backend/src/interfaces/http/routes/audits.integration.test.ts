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
  // Stub the optionalSession middleware in integration: any request that
  // sets `X-Test-User-Id` is treated as authenticated. Mirrors the real
  // route's contract without needing the magic-link round trip.
  app.use((req, _res, next) => {
    const id = req.header("X-Test-User-Id");
    if (id) req.userId = id;
    next();
  });
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
    // Anonymous → no userId attached.
    expect(stored?.userId).toBeFalsy();
  });

  it("attaches userId when a session is present (still records clientId)", async () => {
    const userId = new mongoose.Types.ObjectId();
    const res = await request(buildApp())
      .post("/api/audits")
      .set("X-Client-Id", VALID_ID)
      .set("X-Test-User-Id", userId.toString())
      .send({ url: "https://signed-in.example" });

    expect(res.status).toBe(202);
    const stored = await AuditModel.findOne({ url: "https://signed-in.example" }).lean();
    expect(stored?.userId?.toString()).toBe(userId.toString());
    // clientId still recorded so the merge-on-verify path keeps working
    // for users who were anonymous on a different device first.
    expect(stored?.clientId).toBe(VALID_ID);
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

  it("does not leak Mongo internals or owner clientId on the detail response", async () => {
    // contracts.ts has long claimed those fields would be filtered;
    // until now there was no test holding the route to it. The route
    // explicitly projects via .select() — this guards against a
    // refactor dropping the projection by accident.
    await AuditModel.create({
      publicId: "no-leak",
      clientId: VALID_ID,
      url: "https://noleak.example",
      status: "done",
      score: 70,
      totals: { critical: 0, serious: 0, moderate: 0, minor: 0 },
      violations: [],
      passes: 1,
      durationMs: 1,
    });
    const res = await request(buildApp()).get("/api/audits/no-leak");
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body).not.toHaveProperty("_id");
    expect(body).not.toHaveProperty("__v");
    expect(body).not.toHaveProperty("clientId");
    expect(body).not.toHaveProperty("updatedAt");
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

  it("orders results newest-first regardless of insertion order", async () => {
    // Insert in reverse-chronological order so a missing `.sort()` would
    // return them in insertion order (which is exactly what we want to
    // detect): the test only passes if the route actively sorts by
    // createdAt desc.
    const now = Date.now();
    await AuditModel.create([
      {
        publicId: "newest",
        clientId: VALID_ID,
        url: "https://newest.example",
        status: "done",
        createdAt: new Date(now),
      },
      {
        publicId: "middle",
        clientId: VALID_ID,
        url: "https://middle.example",
        status: "done",
        createdAt: new Date(now - 60_000),
      },
      {
        publicId: "oldest",
        clientId: VALID_ID,
        url: "https://oldest.example",
        status: "done",
        createdAt: new Date(now - 600_000),
      },
    ]);

    const res = await request(buildApp()).get("/api/audits").set("X-Client-Id", VALID_ID);

    expect(res.body.map((a: { publicId: string }) => a.publicId)).toEqual([
      "newest",
      "middle",
      "oldest",
    ]);
  });

  it("returns only the documented summary fields (no _id, __v, violations, clientId)", async () => {
    // The route's .select() projection is the API contract. Returning
    // _id leaks Mongo internals; returning clientId leaks the owner of
    // the audit; returning violations on the list endpoint blows up the
    // payload. Asserting the exact key set keeps every one of those
    // honest under refactoring.
    await AuditModel.create({
      publicId: "summary-shape",
      clientId: VALID_ID,
      url: "https://shape.example",
      status: "done",
      score: 80,
      totals: { critical: 0, serious: 1, moderate: 0, minor: 0 },
      violations: [
        {
          id: "color-contrast",
          impact: "serious",
          description: "x",
          helpUrl: "https://example.com/h",
          tags: [],
          nodes: [],
        },
      ],
      passes: 10,
      durationMs: 500,
    });

    const res = await request(buildApp()).get("/api/audits").set("X-Client-Id", VALID_ID);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    const items = res.body as Array<Record<string, unknown>>;
    const item = items[0];
    if (!item) throw new Error("expected one item");
    expect(Object.keys(item).sort()).toEqual(
      ["createdAt", "publicId", "score", "status", "totals", "url"].sort()
    );
  });

  it("scopes the list by userId when a session is present, ignoring X-Client-Id", async () => {
    const userId = new mongoose.Types.ObjectId();
    await AuditModel.create([
      { publicId: "p1", url: "https://x.example", userId, status: "done" },
      { publicId: "p2", url: "https://y.example", clientId: VALID_ID, status: "done" },
      { publicId: "p3", url: "https://z.example", userId, clientId: OTHER_ID, status: "done" },
    ]);
    const r = await request(buildApp())
      .get("/api/audits")
      .set("X-Client-Id", VALID_ID) // intentionally wrong — must be ignored
      .set("X-Test-User-Id", userId.toString());
    expect(r.status).toBe(200);
    expect((r.body as Array<{ publicId: string }>).map((a) => a.publicId).sort()).toEqual([
      "p1",
      "p3",
    ]);
  });

  it("does not require X-Client-Id when a session is present", async () => {
    const userId = new mongoose.Types.ObjectId();
    await AuditModel.create({
      publicId: "session-only",
      url: "https://so.example",
      userId,
      status: "done",
    });
    const r = await request(buildApp()).get("/api/audits").set("X-Test-User-Id", userId.toString());
    expect(r.status).toBe(200);
    expect((r.body as Array<{ publicId: string }>).map((a) => a.publicId)).toEqual([
      "session-only",
    ]);
  });

  it("400s with invalid_client_id when neither session nor X-Client-Id is present", async () => {
    const r = await request(buildApp()).get("/api/audits");
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: { code: "invalid_client_id" } });
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
