import { FakeSender } from "./fakeSender";

describe("FakeSender", () => {
  it("captures every magic link sent in order", async () => {
    const s = new FakeSender();
    await s.sendMagicLink({ to: "a@b.com", link: "https://x/verify?token=abc" });
    await s.sendMagicLink({ to: "c@d.com", link: "https://x/verify?token=xyz" });
    expect(s.inbox).toEqual([
      { to: "a@b.com", link: "https://x/verify?token=abc" },
      { to: "c@d.com", link: "https://x/verify?token=xyz" },
    ]);
  });

  it("clearInbox empties the captured messages", async () => {
    const s = new FakeSender();
    await s.sendMagicLink({ to: "a@b.com", link: "https://x" });
    s.clearInbox();
    expect(s.inbox).toEqual([]);
  });
});
