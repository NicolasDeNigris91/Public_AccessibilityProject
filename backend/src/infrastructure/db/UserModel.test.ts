import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { UserModel } from "./UserModel";

describe("UserModel", () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await UserModel.syncIndexes();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(async () => {
    await UserModel.deleteMany({});
  });

  it("persists email lowercased and trimmed", async () => {
    const u = await UserModel.create({ email: "  AlICe@Example.com " });
    const found = await UserModel.findById(u._id).lean();
    expect(found?.email).toBe("alice@example.com");
  });

  it("rejects a duplicate email (unique index)", async () => {
    await UserModel.create({ email: "bob@example.com" });
    await expect(UserModel.create({ email: "bob@example.com" })).rejects.toThrow(/duplicate/i);
  });

  it("rejects an invalid email", async () => {
    await expect(UserModel.create({ email: "not-an-email" })).rejects.toThrow();
  });
});
