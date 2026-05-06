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
});
