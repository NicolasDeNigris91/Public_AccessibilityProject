import { createEmailSender } from "./factory";
import { ConsoleSender } from "./consoleSender";
import { ResendSender } from "./resendSender";

describe("createEmailSender", () => {
  it("returns ConsoleSender in development with no provider configured", () => {
    expect(createEmailSender({ NODE_ENV: "development" })).toBeInstanceOf(ConsoleSender);
  });

  it("returns ResendSender when EMAIL_PROVIDER=resend and creds present", () => {
    const sender = createEmailSender({
      NODE_ENV: "production",
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "re_test",
      EMAIL_FROM: "Euthus <noreply@euthus.com>",
    });
    expect(sender).toBeInstanceOf(ResendSender);
  });

  it("throws when EMAIL_PROVIDER=resend but RESEND_API_KEY is missing (boot fail)", () => {
    expect(() =>
      createEmailSender({
        NODE_ENV: "production",
        EMAIL_PROVIDER: "resend",
        EMAIL_FROM: "Euthus <noreply@euthus.com>",
      })
    ).toThrow(/RESEND_API_KEY/);
  });

  it("throws when EMAIL_PROVIDER=resend but EMAIL_FROM is missing", () => {
    expect(() =>
      createEmailSender({
        NODE_ENV: "production",
        EMAIL_PROVIDER: "resend",
        RESEND_API_KEY: "re_test",
      })
    ).toThrow(/EMAIL_FROM/);
  });

  it("returns null in production with no provider set (route must 503)", () => {
    expect(createEmailSender({ NODE_ENV: "production" })).toBeNull();
  });
});
