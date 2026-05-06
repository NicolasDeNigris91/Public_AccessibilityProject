import { LastLinkCapture } from "./lastLinkCapture";
import { FakeSender } from "./fakeSender";

describe("LastLinkCapture", () => {
  it("forwards every send to the inner sender", async () => {
    const inner = new FakeSender();
    const capture = new LastLinkCapture(inner);
    await capture.sendMagicLink({ to: "a@b.com", link: "https://x/v?token=1" });
    await capture.sendMagicLink({ to: "a@b.com", link: "https://x/v?token=2" });
    expect(inner.inbox).toHaveLength(2);
  });

  it("remembers only the most recent link per email", async () => {
    const inner = new FakeSender();
    const capture = new LastLinkCapture(inner);
    await capture.sendMagicLink({ to: "a@b.com", link: "https://x/v?token=1" });
    await capture.sendMagicLink({ to: "a@b.com", link: "https://x/v?token=2" });
    expect(capture.lookup("a@b.com")).toBe("https://x/v?token=2");
  });

  it("normalizes case + whitespace on both write and read", async () => {
    const inner = new FakeSender();
    const capture = new LastLinkCapture(inner);
    await capture.sendMagicLink({ to: "  User@Example.com  ", link: "https://x/v?token=z" });
    expect(capture.lookup("user@example.com")).toBe("https://x/v?token=z");
    expect(capture.lookup("  USER@example.com")).toBe("https://x/v?token=z");
  });

  it("returns undefined for an unknown email", async () => {
    const inner = new FakeSender();
    const capture = new LastLinkCapture(inner);
    expect(capture.lookup("nobody@b.com")).toBeUndefined();
  });

  it("propagates inner sender errors", async () => {
    const broken = {
      sendMagicLink: jest.fn().mockRejectedValue(new Error("smtp down")),
    };
    const capture = new LastLinkCapture(broken);
    await expect(capture.sendMagicLink({ to: "a@b.com", link: "x" })).rejects.toThrow(/smtp down/);
  });
});
