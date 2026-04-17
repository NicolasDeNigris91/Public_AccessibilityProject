import "express-async-errors";
import express from "express";
import request from "supertest";

jest.mock("@/infrastructure/db/AuditModel", () => ({
  AuditModel: {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  },
}));

jest.mock("@/infrastructure/queue/auditQueue", () => ({
  auditQueue: { add: jest.fn() },
}));

jest.mock("@/application/assertSafeUrl", () => {
  const actual = jest.requireActual("@/application/assertSafeUrl");
  return {
    ...actual,
    assertSafeUrl: jest.fn().mockResolvedValue(undefined),
  };
});

import { AuditModel } from "@/infrastructure/db/AuditModel";
import { auditQueue } from "@/infrastructure/queue/auditQueue";
import { assertSafeUrl, UnsafeUrlError } from "@/application/assertSafeUrl";
import { auditsRouter } from "./audits";
import { errorHandler } from "../middlewares/errorHandler";

const VALID_ID = "550e8400-e29b-41d4-a716-446655440000";
const OTHER_ID = "11111111-1111-4111-8111-111111111111";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/audits", auditsRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /api/audits", () => {
  it("persists clientId on the created audit", async () => {
    (AuditModel.create as jest.Mock).mockResolvedValue(undefined);
    (auditQueue.add as jest.Mock).mockResolvedValue(undefined);

    const res = await request(buildApp())
      .post("/api/audits")
      .set("X-Client-Id", VALID_ID)
      .send({ url: "https://example.com" });

    expect(res.status).toBe(202);
    expect(AuditModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: VALID_ID,
        url: "https://example.com",
        status: "queued",
      })
    );
  });

  it("returns 400 when X-Client-Id is missing", async () => {
    const res = await request(buildApp())
      .post("/api/audits")
      .send({ url: "https://example.com" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_client_id" });
    expect(AuditModel.create).not.toHaveBeenCalled();
  });

  it("rejects an unsafe URL with 400 and never enqueues", async () => {
    (assertSafeUrl as jest.Mock).mockRejectedValueOnce(
      new UnsafeUrlError("unsafe_target")
    );

    const res = await request(buildApp())
      .post("/api/audits")
      .set("X-Client-Id", VALID_ID)
      .send({ url: "http://169.254.169.254/latest/meta-data" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "unsafe_url:unsafe_target" });
    expect(AuditModel.create).not.toHaveBeenCalled();
    expect(auditQueue.add).not.toHaveBeenCalled();
  });
});

describe("GET /api/audits", () => {
  it("filters by clientId from header", async () => {
    const chain = {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([{ publicId: "abc", clientId: VALID_ID }]),
    };
    (AuditModel.find as jest.Mock).mockReturnValue(chain);

    const res = await request(buildApp())
      .get("/api/audits")
      .set("X-Client-Id", VALID_ID);

    expect(res.status).toBe(200);
    expect(AuditModel.find).toHaveBeenCalledWith({ clientId: VALID_ID });
    expect(res.body).toEqual([{ publicId: "abc", clientId: VALID_ID }]);
  });

  it("does not see audits from another clientId", async () => {
    const chain = {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    };
    (AuditModel.find as jest.Mock).mockReturnValue(chain);

    const res = await request(buildApp())
      .get("/api/audits")
      .set("X-Client-Id", OTHER_ID);

    expect(AuditModel.find).toHaveBeenCalledWith({ clientId: OTHER_ID });
    expect(res.body).toEqual([]);
  });

  it("returns 400 when X-Client-Id is missing", async () => {
    const res = await request(buildApp()).get("/api/audits");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_client_id" });
    expect(AuditModel.find).not.toHaveBeenCalled();
  });
});

describe("GET /api/audits/:publicId", () => {
  it("is public and works without X-Client-Id", async () => {
    (AuditModel.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue({ publicId: "abc", url: "https://x.com" }),
    });

    const res = await request(buildApp()).get("/api/audits/abc");

    expect(res.status).toBe(200);
    expect(AuditModel.findOne).toHaveBeenCalledWith({ publicId: "abc" });
    expect(res.body).toEqual({ publicId: "abc", url: "https://x.com" });
  });

  it("returns 404 when not found", async () => {
    (AuditModel.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });

    const res = await request(buildApp()).get("/api/audits/missing");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });
});
