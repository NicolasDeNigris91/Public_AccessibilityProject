import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MagicLinkModel } from "@/infrastructure/db/MagicLinkModel";
import { FakeSender } from "@/infrastructure/email/fakeSender";
import { hashToken } from "@/infrastructure/auth/tokens";
import { requestMagicLink } from "./requestMagicLink";

describe("requestMagicLink", () => {
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
    await MagicLinkModel.deleteMany({});
  });

  it("creates a MagicLink, sends an email, and stores the hash (not raw)", async () => {
    const sender = new FakeSender();
    await requestMagicLink({
      email: "USER@example.com",
      sender,
      webBaseUrl: "https://api.test",
      ttlMs: 15 * 60_000,
    });
    expect(sender.inbox).toHaveLength(1);
    expect(sender.inbox[0]?.to).toBe("user@example.com");
    const link = sender.inbox[0]?.link ?? "";
    expect(link).toMatch(/^https:\/\/api\.test\/api\/auth\/verify\?token=[A-Za-z0-9_-]{43}$/);
    const tokens = link.match(/token=([A-Za-z0-9_-]{43})/);
    const raw = tokens?.[1] ?? "";
    const stored = await MagicLinkModel.findOne({ tokenHash: hashToken(raw) }).lean();
    expect(stored).toBeTruthy();
    expect(stored?.email).toBe("user@example.com");
    expect(stored?.usedAt).toBeNull();
  });

  it("normalises the email (trim + lowercase) before storing and before sending", async () => {
    const sender = new FakeSender();
    await requestMagicLink({
      email: "  Mixed.Case@EXAMPLE.com  ",
      sender,
      webBaseUrl: "https://api.test",
      ttlMs: 15 * 60_000,
    });
    const stored = await MagicLinkModel.findOne({}).lean();
    expect(stored?.email).toBe("mixed.case@example.com");
    // Sender path bypasses any schema-level coercion, so this directly
    // exercises the trim().toLowerCase() in the source.
    expect(sender.inbox[0]?.to).toBe("mixed.case@example.com");
  });

  it("propagates sender failures so the route can decide on the response", async () => {
    const sender = {
      sendMagicLink: jest.fn().mockRejectedValue(new Error("smtp down")),
    };
    await expect(
      requestMagicLink({
        email: "a@b.com",
        sender,
        webBaseUrl: "https://api.test",
        ttlMs: 60_000,
      })
    ).rejects.toThrow("smtp down");
  });

  it("persists clientId on the link when provided so /verify can merge anonymous audits", async () => {
    const sender = new FakeSender();
    await requestMagicLink({
      email: "a@b.com",
      sender,
      webBaseUrl: "https://api.test",
      ttlMs: 60_000,
      clientId: "cid-from-frontend",
    });
    const stored = await MagicLinkModel.findOne({}).lean();
    expect(stored?.clientId).toBe("cid-from-frontend");
  });

  it("leaves clientId absent on the link when not provided (server-side or curl POSTs)", async () => {
    const sender = new FakeSender();
    await requestMagicLink({
      email: "a@b.com",
      sender,
      webBaseUrl: "https://api.test",
      ttlMs: 60_000,
    });
    const stored = await MagicLinkModel.findOne({}).lean();
    expect(stored?.clientId == null).toBe(true);
  });

  describe("idempotency", () => {
    it("short-circuits a duplicate (email, idempotencyKey) inside the TTL: no second link, no second email", async () => {
      const sender = new FakeSender();
      const args = {
        email: "dup@b.com",
        sender,
        webBaseUrl: "https://api.test",
        ttlMs: 60_000,
        idempotencyKey: "11111111-2222-3333-4444-555555555555",
      };
      await requestMagicLink(args);
      await requestMagicLink(args);
      expect(sender.inbox).toHaveLength(1);
      expect(await MagicLinkModel.countDocuments({})).toBe(1);
    });

    it("treats different (email, idempotencyKey) pairs as distinct sends", async () => {
      const sender = new FakeSender();
      await requestMagicLink({
        email: "a@b.com",
        sender,
        webBaseUrl: "https://api.test",
        ttlMs: 60_000,
        idempotencyKey: "key-A-aaaaaaaaaaaaaa",
      });
      await requestMagicLink({
        email: "a@b.com",
        sender,
        webBaseUrl: "https://api.test",
        ttlMs: 60_000,
        idempotencyKey: "key-B-bbbbbbbbbbbbbb",
      });
      expect(sender.inbox).toHaveLength(2);
      expect(await MagicLinkModel.countDocuments({})).toBe(2);
    });

    it("scopes idempotency by email so the same key for two different mailboxes is not deduped", async () => {
      const sender = new FakeSender();
      const sharedKey = "shared-key-aaaaaaa";
      await requestMagicLink({
        email: "alice@b.com",
        sender,
        webBaseUrl: "https://api.test",
        ttlMs: 60_000,
        idempotencyKey: sharedKey,
      });
      await requestMagicLink({
        email: "bob@b.com",
        sender,
        webBaseUrl: "https://api.test",
        ttlMs: 60_000,
        idempotencyKey: sharedKey,
      });
      expect(sender.inbox).toHaveLength(2);
    });

    it("re-runs the full flow once the prior link has expired, even with the same key", async () => {
      const sender = new FakeSender();
      const args = {
        email: "expired@b.com",
        sender,
        webBaseUrl: "https://api.test",
        ttlMs: 60_000,
        idempotencyKey: "key-expired-aaaaaaa",
      };
      await requestMagicLink(args);
      await MagicLinkModel.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
      await requestMagicLink(args);
      expect(sender.inbox).toHaveLength(2);
    });

    it("falls back to non-idempotent behavior when the header is absent (legacy clients)", async () => {
      const sender = new FakeSender();
      await requestMagicLink({
        email: "legacy@b.com",
        sender,
        webBaseUrl: "https://api.test",
        ttlMs: 60_000,
      });
      await requestMagicLink({
        email: "legacy@b.com",
        sender,
        webBaseUrl: "https://api.test",
        ttlMs: 60_000,
      });
      expect(sender.inbox).toHaveLength(2);
    });
  });
});
