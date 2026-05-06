import { createEmailSender } from "./factory";
import { ConsoleSender } from "./consoleSender";
import { ResendSender } from "./resendSender";

describe("createEmailSender", () => {
  it("returns ConsoleSender in development with no provider configured", () => {
    expect(createEmailSender({ NODE_ENV: "development" })).toBeInstanceOf(ConsoleSender);
  });

  it("returns CircuitBreakerSender wrapping ResendSender when EMAIL_PROVIDER=resend and creds present", () => {
    const sender = createEmailSender({
      NODE_ENV: "production",
      EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "re_test",
      EMAIL_FROM: "Euthus <noreply@euthus.com>",
    });
    // The wrapper *is* an EmailSender; assert via the breaker class
    // and via the inner reference so a future refactor that drops
    // the wrapper fails this test loudly.
    const { CircuitBreakerSender } =
      jest.requireActual<typeof import("./CircuitBreakerSender")>("./CircuitBreakerSender");
    expect(sender).toBeInstanceOf(CircuitBreakerSender);
    // Inner is private but exposed via the class shape we control.
    const inner = (sender as unknown as { inner: unknown }).inner;
    expect(inner).toBeInstanceOf(ResendSender);
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
