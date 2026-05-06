import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { SessionModel } from "@/infrastructure/db/SessionModel";
import { generateToken, hashToken } from "@/infrastructure/auth/tokens";
import { logout } from "./logout";

describe("logout", () => {
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
    await SessionModel.deleteMany({});
  });

  it("deletes the session row matching the cookie", async () => {
    const userId = new mongoose.Types.ObjectId();
    const raw = generateToken();
    await SessionModel.create({
      tokenHash: hashToken(raw),
      userId,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await logout(raw);
    expect(await SessionModel.countDocuments()).toBe(0);
  });

  it("is a no-op for an unknown token (idempotent)", async () => {
    await logout("unknown");
    expect(await SessionModel.countDocuments()).toBe(0);
  });
});
