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

  async function seedLink(
    email: string,
    opts: Partial<{ expiresAt: Date; usedAt: Date; clientId: string }> = {}
  ) {
    const raw = generateToken();
    const ml = await MagicLinkModel.create({
      tokenHash: hashToken(raw),
      email,
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 60_000),
      usedAt: opts.usedAt ?? null,
      ...(opts.clientId ? { clientId: opts.clientId } : {}),
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

  it("returns the clientId stored on the link so the router can merge anonymous audits without a header", async () => {
    const { raw } = await seedLink("a@b.com", { clientId: "cid-stored" });
    const out = await verifyMagicLink({ rawToken: raw, sessionTtlMs: 60_000 });
    expect(out.clientId).toBe("cid-stored");
  });

  it("returns clientId undefined when the link has none (legacy / non-browser POST)", async () => {
    const { raw } = await seedLink("a@b.com");
    const out = await verifyMagicLink({ rawToken: raw, sessionTtlMs: 60_000 });
    expect(out.clientId).toBeUndefined();
  });

  describe("mutation hardening", () => {
    let mlFindOneSpy: jest.SpyInstance;
    let mlFoauSpy: jest.SpyInstance;
    let userFoauSpy: jest.SpyInstance;

    beforeEach(() => {
      mlFindOneSpy = jest.spyOn(MagicLinkModel, "findOne");
      mlFoauSpy = jest.spyOn(MagicLinkModel, "findOneAndUpdate");
      userFoauSpy = jest.spyOn(UserModel, "findOneAndUpdate");
    });

    afterEach(() => {
      mlFindOneSpy.mockRestore();
      mlFoauSpy.mockRestore();
      userFoauSpy.mockRestore();
    });

    it("scopes the initial link lookup by tokenHash exactly (filter not stripped)", async () => {
      await seedLink("noise@b.com");
      const { raw } = await seedLink("target@b.com");
      await verifyMagicLink({ rawToken: raw, sessionTtlMs: 60_000 });
      expect(mlFindOneSpy).toHaveBeenCalledWith({ tokenHash: hashToken(raw) });
    });

    it("treats link.expiresAt === Date.now() as still valid (strict <, not <=)", async () => {
      const fixedNow = Date.now();
      const dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(fixedNow);
      try {
        const { raw } = await seedLink("bound@b.com", {
          expiresAt: new Date(fixedNow),
        });
        const out = await verifyMagicLink({ rawToken: raw, sessionTtlMs: 60_000 });
        expect(out.email).toBe("bound@b.com");
      } finally {
        dateNowSpy.mockRestore();
      }
    });

    it("short-circuits when link.usedAt is already set (no atomic claim attempted)", async () => {
      const { raw } = await seedLink("used@b.com", {
        usedAt: new Date(Date.now() - 1000),
      });
      await expect(verifyMagicLink({ rawToken: raw, sessionTtlMs: 60_000 })).rejects.toThrow(
        /already_used/
      );
      expect(mlFoauSpy).not.toHaveBeenCalled();
    });

    it("claims the link atomically with { tokenHash, usedAt: null } and { new: true }", async () => {
      const { raw } = await seedLink("claim@b.com");
      await verifyMagicLink({ rawToken: raw, sessionTtlMs: 60_000 });
      expect(mlFoauSpy).toHaveBeenCalledWith(
        { tokenHash: hashToken(raw), usedAt: null },
        { $set: { usedAt: expect.any(Date) } },
        { new: true }
      );
    });

    it("throws already_used when the atomic claim returns null (concurrent verify race)", async () => {
      const { raw } = await seedLink("race@b.com");
      mlFoauSpy.mockResolvedValueOnce(null);
      await expect(verifyMagicLink({ rawToken: raw, sessionTtlMs: 60_000 })).rejects.toThrow(
        /already_used/
      );
    });

    it("upserts the user with { email } filter and $setOnInsert: { email } (does not match unrelated users)", async () => {
      const stranger = await UserModel.create({ email: "stranger@x.com" });
      const { raw } = await seedLink("fresh@b.com");
      const out = await verifyMagicLink({ rawToken: raw, sessionTtlMs: 60_000 });
      expect(out.email).toBe("fresh@b.com");
      expect(out.userId).not.toBe((stranger._id as { toString(): string }).toString());
      expect(userFoauSpy).toHaveBeenCalledWith(
        { email: "fresh@b.com" },
        { $setOnInsert: { email: "fresh@b.com" } },
        { upsert: true, new: true }
      );
      expect(await UserModel.countDocuments({ email: "stranger@x.com" })).toBe(1);
      expect(await UserModel.countDocuments({ email: "fresh@b.com" })).toBe(1);
    });
  });
});
