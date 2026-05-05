import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { UserModel } from "@/infrastructure/db/UserModel";
import { MagicLinkModel } from "@/infrastructure/db/MagicLinkModel";
import { SessionModel } from "@/infrastructure/db/SessionModel";
import { hashToken, generateToken } from "@/infrastructure/auth/tokens";
import { verifyMagicLink, VerifyError } from "./verifyMagicLink";

describe("verifyMagicLink", () => {
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
    await Promise.all([
      UserModel.deleteMany({}),
      MagicLinkModel.deleteMany({}),
      SessionModel.deleteMany({}),
    ]);
  });

  async function seedLink(email: string, opts: Partial<{ expiresAt: Date; usedAt: Date }> = {}) {
    const raw = generateToken();
    const ml = await MagicLinkModel.create({
      tokenHash: hashToken(raw),
      email,
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 60_000),
      usedAt: opts.usedAt ?? null,
    });
    return { raw, ml };
  }

  it("creates a User on first verify, marks the link used, returns a Session", async () => {
    const { raw } = await seedLink("a@b.com");
    const out = await verifyMagicLink({ rawToken: raw, sessionTtlMs: 30 * 86_400_000 });
    expect(out.userId).toBeTruthy();
    expect(out.rawSessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(out.email).toBe("a@b.com");
    expect(await UserModel.countDocuments({ email: "a@b.com" })).toBe(1);
    const link = await MagicLinkModel.findOne({});
    expect(link?.usedAt).toBeInstanceOf(Date);
  });

  it("reuses an existing User on subsequent verifies", async () => {
    const u = await UserModel.create({ email: "a@b.com" });
    const { raw } = await seedLink("a@b.com");
    const out = await verifyMagicLink({ rawToken: raw, sessionTtlMs: 60_000 });
    expect(out.userId).toBe((u._id as { toString(): string }).toString());
    expect(await UserModel.countDocuments()).toBe(1);
  });

  it("rejects an unknown token", async () => {
    await expect(
      verifyMagicLink({ rawToken: generateToken(), sessionTtlMs: 60_000 })
    ).rejects.toBeInstanceOf(VerifyError);
  });

  it("rejects an expired token", async () => {
    const { raw } = await seedLink("a@b.com", { expiresAt: new Date(Date.now() - 1000) });
    await expect(verifyMagicLink({ rawToken: raw, sessionTtlMs: 60_000 })).rejects.toThrow(
      /expired/
    );
  });

  it("rejects a previously-used token (single use)", async () => {
    const { raw } = await seedLink("a@b.com", { usedAt: new Date(Date.now() - 1000) });
    await expect(verifyMagicLink({ rawToken: raw, sessionTtlMs: 60_000 })).rejects.toThrow(
      /already_used/
    );
  });
});
