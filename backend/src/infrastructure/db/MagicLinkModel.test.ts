import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MagicLinkModel } from "./MagicLinkModel";

describe("MagicLinkModel", () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await MagicLinkModel.syncIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(async () => {
    await MagicLinkModel.deleteMany({});
  });

  it("requires tokenHash, email, expiresAt", async () => {
    await expect(MagicLinkModel.create({})).rejects.toThrow();
  });

  it("persists usedAt as null on create", async () => {
    const ml = await MagicLinkModel.create({
      tokenHash: "h",
      email: "a@b.com",
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(ml.usedAt).toBeNull();
  });

  it("declares a TTL index on expiresAt", async () => {
    const indexes = await MagicLinkModel.collection.indexes();
    const ttl = indexes.find((i) => i.expireAfterSeconds !== undefined);
    expect(ttl?.key).toEqual({ expiresAt: 1 });
    expect(ttl?.expireAfterSeconds).toBe(0);
  });

  it("declares a unique index on tokenHash", async () => {
    const indexes = await MagicLinkModel.collection.indexes();
    const tk = indexes.find((i) => i.key?.tokenHash === 1);
    expect(tk?.unique).toBe(true);
  });
});
