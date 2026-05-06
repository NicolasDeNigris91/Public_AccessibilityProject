import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { AuditModel } from "@/infrastructure/db/AuditModel";
import { logger } from "@/config/logger";
import {
  authAnonymousAuditsMergeTotal,
  authAnonymousAuditsMovedTotal,
} from "@/infrastructure/metrics/registry";
import { mergeAnonymousAudits } from "./mergeAnonymousAudits";

describe("mergeAnonymousAudits", () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(async () => {
    await AuditModel.deleteMany({});
  });

  it("attaches userId to anonymous audits with the matching clientId", async () => {
    const userId = new mongoose.Types.ObjectId();
    await AuditModel.create([
      { publicId: "a", url: "https://x", clientId: "cid-1" },
      { publicId: "b", url: "https://y", clientId: "cid-1" },
      { publicId: "c", url: "https://z", clientId: "other" },
    ]);
    const moved = await mergeAnonymousAudits({ clientId: "cid-1", userId });
    expect(moved).toBe(2);
    const a = await AuditModel.findOne({ publicId: "a" }).lean();
    expect(a?.userId?.toString()).toBe(userId.toString());
    const c = await AuditModel.findOne({ publicId: "c" }).lean();
    expect(c?.userId).toBeUndefined();
  });

  it("does not touch audits already attached to a user", async () => {
    const userA = new mongoose.Types.ObjectId();
    const userB = new mongoose.Types.ObjectId();
    await AuditModel.create({
      publicId: "x",
      url: "https://x",
      clientId: "cid",
      userId: userA,
    });
    const moved = await mergeAnonymousAudits({ clientId: "cid", userId: userB });
    expect(moved).toBe(0);
    const x = await AuditModel.findOne({ publicId: "x" }).lean();
    expect(x?.userId?.toString()).toBe(userA.toString());
  });

  it("is a no-op when clientId is empty", async () => {
    const moved = await mergeAnonymousAudits({
      clientId: "",
      userId: new mongoose.Types.ObjectId(),
    });
    expect(moved).toBe(0);
  });

  describe("observability", () => {
    let logSpy: jest.SpyInstance;

    beforeEach(() => {
      authAnonymousAuditsMergeTotal.reset();
      authAnonymousAuditsMovedTotal.reset();
      logSpy = jest.spyOn(logger, "info").mockImplementation(() => undefined as never);
    });

    afterEach(() => {
      logSpy.mockRestore();
    });

    async function readCounter(
      counter: typeof authAnonymousAuditsMergeTotal | typeof authAnonymousAuditsMovedTotal,
      labels?: Record<string, string>
    ): Promise<number> {
      const data = await counter.get();
      const match = labels
        ? data.values.find((v) => {
            const vLabels = v.labels as Record<string, string | number>;
            return Object.entries(labels).every(([k, val]) => vLabels[k] === val);
          })
        : data.values[0];
      return match?.value ?? 0;
    }

    it("increments merge_total{outcome=merged} when audits are migrated", async () => {
      const userId = new mongoose.Types.ObjectId();
      await AuditModel.create([
        { publicId: "a", url: "https://x", clientId: "cid-1" },
        { publicId: "b", url: "https://y", clientId: "cid-1" },
      ]);
      await mergeAnonymousAudits({ clientId: "cid-1", userId });
      expect(await readCounter(authAnonymousAuditsMergeTotal, { outcome: "merged" })).toBe(1);
    });

    it("increments merge_total{outcome=no_match} when clientId has no anonymous audits", async () => {
      await mergeAnonymousAudits({
        clientId: "ghost",
        userId: new mongoose.Types.ObjectId(),
      });
      expect(await readCounter(authAnonymousAuditsMergeTotal, { outcome: "no_match" })).toBe(1);
    });

    it("increments merge_total{outcome=skipped} when clientId is empty", async () => {
      await mergeAnonymousAudits({
        clientId: "",
        userId: new mongoose.Types.ObjectId(),
      });
      expect(await readCounter(authAnonymousAuditsMergeTotal, { outcome: "skipped" })).toBe(1);
    });

    it("adds modifiedCount to moved_total", async () => {
      const userId = new mongoose.Types.ObjectId();
      await AuditModel.create([
        { publicId: "a", url: "https://x", clientId: "cid-2" },
        { publicId: "b", url: "https://y", clientId: "cid-2" },
        { publicId: "c", url: "https://z", clientId: "cid-2" },
      ]);
      await mergeAnonymousAudits({ clientId: "cid-2", userId });
      expect(await readCounter(authAnonymousAuditsMovedTotal)).toBe(3);
    });

    it("emits a structured log with userId, clientId, modifiedCount, outcome and the literal 'merge_anonymous_audits' message", async () => {
      const userId = new mongoose.Types.ObjectId();
      await AuditModel.create({
        publicId: "x",
        url: "https://x",
        clientId: "cid-log",
      });
      await mergeAnonymousAudits({ clientId: "cid-log", userId });

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "auth.merge_anonymous_audits",
          userId: userId.toString(),
          clientId: "cid-log",
          modifiedCount: 1,
          outcome: "merged",
        }),
        "merge_anonymous_audits"
      );
    });

    it("never increments moved_total when modifiedCount is 0 (no .inc(0) noise)", async () => {
      const incSpy = jest.spyOn(authAnonymousAuditsMovedTotal, "inc");
      try {
        await mergeAnonymousAudits({
          clientId: "ghost",
          userId: new mongoose.Types.ObjectId(),
        });
        await mergeAnonymousAudits({
          clientId: "",
          userId: new mongoose.Types.ObjectId(),
        });
        expect(incSpy).not.toHaveBeenCalled();
      } finally {
        incSpy.mockRestore();
      }
    });
  });
});
