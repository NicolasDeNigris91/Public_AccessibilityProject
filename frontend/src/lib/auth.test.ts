import { requestMagicLink, fetchSession, logout } from "./auth";

describe("auth client", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });
  afterEach(() => {
    (global.fetch as jest.Mock).mockReset();
  });

  describe("requestMagicLink", () => {
    it("POSTs JSON with credentials and the email body", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 202 });
      await requestMagicLink("a@b.com");
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/magic-link"),
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          headers: expect.objectContaining({ "Content-Type": "application/json" }),
          body: JSON.stringify({ email: "a@b.com" }),
        })
      );
    });

    it("throws the backend error code on 503", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({
          error: { code: "auth/email-not-configured", message: "x" },
          requestId: "r1",
        }),
      });
      await expect(requestMagicLink("a@b.com")).rejects.toThrow(/email-not-configured/);
    });

    it("throws invalid_email on 400", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { code: "invalid_email" } }),
      });
      await expect(requestMagicLink("not-an-email")).rejects.toThrow(/invalid_email/);
    });

    it("throws rate_limited_per_ip_email on 429", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: { code: "rate_limited_per_ip_email" } }),
      });
      await expect(requestMagicLink("a@b.com")).rejects.toThrow(/rate_limited/);
    });

    it("falls back to http_<status> when body is not JSON", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error("not json");
        },
      });
      await expect(requestMagicLink("a@b.com")).rejects.toThrow(/http_502/);
    });
  });

  describe("fetchSession", () => {
    it("returns the user when signed in", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ user: { id: "u1", email: "a@b.com" } }),
      });
      expect(await fetchSession()).toEqual({ id: "u1", email: "a@b.com" });
    });

    it("returns null when the API responds 200 with user: null", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ user: null }),
      });
      expect(await fetchSession()).toBeNull();
    });

    it("returns null when the API responds non-2xx", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500 });
      expect(await fetchSession()).toBeNull();
    });

    it("includes credentials so the cookie travels", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ user: null }),
      });
      await fetchSession();
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/me"),
        expect.objectContaining({ credentials: "include" })
      );
    });
  });

  describe("logout", () => {
    it("POSTs with credentials and resolves silently", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 204 });
      await logout();
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/logout"),
        expect.objectContaining({ method: "POST", credentials: "include" })
      );
    });

    it("does not throw when the network fetch resolves non-ok", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500 });
      await expect(logout()).resolves.toBeUndefined();
    });
  });
});
