import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { UserModel } from "@/infrastructure/db/UserModel";
import { SessionModel } from "@/infrastructure/db/SessionModel";
import { generateToken, hashToken } from "@/infrastructure/auth/tokens";
import { getSession } from "./getSession";

describe("getSession", () => {
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
    await Promise.all([UserModel.deleteMany({}), SessionModel.deleteMany({})]);
  });

  it("returns null for a missing or invalid token", async () => {
    expect(await getSession(undefined)).toBeNull();
    expect(await getSession(generateToken())).toBeNull();
  });

  it("returns user info for a live cookie and bumps lastUsedAt", async () => {
    const u = await UserModel.create({ email: "a@b.com" });
    const raw = generateToken();
    const s = await SessionModel.create({
      tokenHash: hashToken(raw),
      userId: u._id,
      expiresAt: new Date(Date.now() + 60_000),
      lastUsedAt: new Date(0),
    });
    const out = await getSession(raw);
    expect(out).toMatchObject({
      userId: (u._id as { toString(): string }).toString(),
      email: "a@b.com",
    });
    const reloaded = await SessionModel.findById(s._id);
    expect(reloaded?.lastUsedAt.getTime()).toBeGreaterThan(0);
  });

  it("returns null for an expired session and deletes it", async () => {
    const u = await UserModel.create({ email: "a@b.com" });
    const raw = generateToken();
    await SessionModel.create({
      tokenHash: hashToken(raw),
      userId: u._id,
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await getSession(raw)).toBeNull();
    expect(await SessionModel.countDocuments()).toBe(0);
  });

  describe("mutation hardening", () => {
    it("returns the session whose tokenHash matches when multiple coexist", async () => {
      const u = await UserModel.create({ email: "a@b.com" });
      const other = await UserModel.create({ email: "x@y.com" });
      const rawTarget = generateToken();
      const rawOther = generateToken();
      await SessionModel.create({
        tokenHash: hashToken(rawOther),
        userId: other._id,
        expiresAt: new Date(Date.now() + 60_000),
      });
      await SessionModel.create({
        tokenHash: hashToken(rawTarget),
        userId: u._id,
        expiresAt: new Date(Date.now() + 60_000),
      });
      const out = await getSession(rawTarget);
      expect(out?.email).toBe("a@b.com");
    });

    it("treats expiresAt === Date.now() as still live (strict <, not <=)", async () => {
      const fixedNow = Date.now();
      const dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(fixedNow);
      try {
        const u = await UserModel.create({ email: "boundary@b.com" });
        const raw = generateToken();
        await SessionModel.create({
          tokenHash: hashToken(raw),
          userId: u._id,
          expiresAt: new Date(fixedNow),
        });
        const out = await getSession(raw);
        expect(out).not.toBeNull();
        expect(out?.email).toBe("boundary@b.com");
      } finally {
        dateNowSpy.mockRestore();
      }
    });
  });
});
