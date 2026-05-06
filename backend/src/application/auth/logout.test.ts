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

  describe("mutation hardening", () => {
    it("does not call deleteOne when rawToken is empty (early return)", async () => {
      const spy = jest.spyOn(SessionModel, "deleteOne");
      try {
        await logout("");
        expect(spy).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });

    it("deletes only the session matching the rawToken's hash, leaving others intact", async () => {
      const userId = new mongoose.Types.ObjectId();
      const rawTarget = generateToken();
      const rawKeep = generateToken();
      await SessionModel.create({
        tokenHash: hashToken(rawTarget),
        userId,
        expiresAt: new Date(Date.now() + 60_000),
      });
      await SessionModel.create({
        tokenHash: hashToken(rawKeep),
        userId,
        expiresAt: new Date(Date.now() + 60_000),
      });
      await logout(rawTarget);
      const remaining = await SessionModel.find({});
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.tokenHash).toBe(hashToken(rawKeep));
    });

    it("calls deleteOne with the tokenHash filter (not an empty selector)", async () => {
      const spy = jest.spyOn(SessionModel, "deleteOne");
      try {
        const raw = generateToken();
        await logout(raw);
        expect(spy).toHaveBeenCalledWith({ tokenHash: hashToken(raw) });
      } finally {
        spy.mockRestore();
      }
    });
  });
});
