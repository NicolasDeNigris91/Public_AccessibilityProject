import { generateToken, hashToken, tokensMatch } from "./tokens";

describe("auth/tokens", () => {
  it("generateToken produces 43-char base64url strings (32 bytes)", () => {
    const t = generateToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("generateToken is overwhelmingly unique across many calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(generateToken());
    expect(seen.size).toBe(1000);
  });

  it("hashToken is deterministic and 64 hex chars (sha256)", () => {
    const h = hashToken("hello");
    expect(h).toBe(hashToken("hello"));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("tokensMatch returns true for the same token, false otherwise", () => {
    const t = generateToken();
    expect(tokensMatch(t, t)).toBe(true);
    expect(tokensMatch(t, generateToken())).toBe(false);
  });

  it("tokensMatch returns false for length-mismatched inputs without throwing", () => {
    expect(tokensMatch("abc", "abcd")).toBe(false);
  });
});
