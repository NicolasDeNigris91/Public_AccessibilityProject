import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { AuditModel } from "@/infrastructure/db/AuditModel";
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
});
