import type { Resend } from "resend";
import { ResendSender } from "./resendSender";

describe("ResendSender", () => {
  it("calls resend.emails.send with from, to, subject, and html", async () => {
    const send = jest.fn().mockResolvedValue({ data: { id: "x" }, error: null });
    const client = { emails: { send } } as unknown as Pick<Resend, "emails">;
    const s = new ResendSender(client, "Euthus <noreply@euthus.com>");
    await s.sendMagicLink({ to: "a@b.com", link: "https://x/v?token=abc" });
    expect(send).toHaveBeenCalledTimes(1);
    const args = send.mock.calls[0][0];
    expect(args.from).toBe("Euthus <noreply@euthus.com>");
    expect(args.to).toEqual(["a@b.com"]);
    expect(args.subject).toBeTruthy();
    expect(args.html).toContain("https://x/v?token=abc");
  });

  it("throws when resend reports an error", async () => {
    const send = jest.fn().mockResolvedValue({
      data: null,
      error: { message: "rate-limited" },
    });
    const client = { emails: { send } } as unknown as Pick<Resend, "emails">;
    const s = new ResendSender(client, "Euthus <noreply@euthus.com>");
    await expect(s.sendMagicLink({ to: "a@b.com", link: "x" })).rejects.toThrow(/rate-limited/);
  });
});
