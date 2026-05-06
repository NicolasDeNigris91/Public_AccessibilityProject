import { serializeSessionCookie, clearSessionCookie, SESSION_COOKIE_NAME } from "./cookies";

describe("auth/cookies", () => {
  it("serializes the cookie with httpOnly+SameSite=Lax+Path=/", () => {
    const c = serializeSessionCookie("rawtoken", { secure: false, maxAgeSec: 60 });
    expect(c).toContain(`${SESSION_COOKIE_NAME}=rawtoken`);
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=Lax");
    expect(c).toContain("Path=/");
    expect(c).toContain("Max-Age=60");
    expect(c).not.toContain("Secure");
  });

  it("includes Secure when secure=true (production)", () => {
    const c = serializeSessionCookie("t", { secure: true, maxAgeSec: 60 });
    expect(c).toContain("Secure");
  });

  it("emits Domain when configured", () => {
    const c = serializeSessionCookie("t", {
      secure: true,
      maxAgeSec: 60,
      domain: ".euthus.com",
    });
    expect(c).toContain("Domain=.euthus.com");
  });

  it("clearSessionCookie returns an immediate-expiry cookie", () => {
    const c = clearSessionCookie({ secure: true });
    expect(c).toContain(`${SESSION_COOKIE_NAME}=;`);
    expect(c).toContain("Max-Age=0");
  });
});
