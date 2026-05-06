import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { SessionModel } from "./SessionModel";

describe("SessionModel", () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await SessionModel.syncIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(async () => {
    await SessionModel.deleteMany({});
  });

  it("requires tokenHash, userId, expiresAt", async () => {
    await expect(SessionModel.create({})).rejects.toThrow();
  });

  it("declares a unique index on tokenHash and a TTL index on expiresAt", async () => {
    const ix = await SessionModel.collection.indexes();
    expect(ix.find((i) => i.key?.tokenHash === 1)?.unique).toBe(true);
    const ttl = ix.find((i) => i.expireAfterSeconds !== undefined);
    expect(ttl?.key).toEqual({ expiresAt: 1 });
    expect(ttl?.expireAfterSeconds).toBe(0);
  });

  it("declares a userId index for per-user lookups", async () => {
    const ix = await SessionModel.collection.indexes();
    expect(ix.find((i) => i.key?.userId === 1)).toBeDefined();
  });
});
