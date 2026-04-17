import {
  UnsafeUrlError,
  assertSafeUrl,
  isSyncSafeUrl,
  type DnsResolver,
} from "./assertSafeUrl";

const resolverReturning =
  (addresses: string[]): DnsResolver =>
  async () =>
    addresses.map((address) => ({ address }));

const resolverThrowing: DnsResolver = async () => {
  throw new Error("ENOTFOUND");
};

const publicResolver: DnsResolver = resolverReturning(["93.184.216.34"]);

describe("assertSafeUrl", () => {
  describe("URL shape", () => {
    it.each(["not a url", "http://", "://no-scheme"])(
      "rejects invalid URL %p",
      async (input) => {
        await expect(assertSafeUrl(input, publicResolver)).rejects.toMatchObject({
          name: "UnsafeUrlError",
          reason: "invalid_url",
        });
      }
    );

    it.each([
      "ftp://example.com",
      "file:///etc/passwd",
      "gopher://example.com",
      "javascript:alert(1)",
    ])("rejects non-http(s) protocol %p", async (input) => {
      await expect(assertSafeUrl(input, publicResolver)).rejects.toMatchObject({
        reason: "unsafe_protocol",
      });
    });
  });

  describe("DNS resolution", () => {
    it("rejects when the resolver throws", async () => {
      await expect(
        assertSafeUrl("https://nxdomain.example", resolverThrowing)
      ).rejects.toMatchObject({ reason: "unresolvable_host" });
    });

    it("rejects when the resolver returns no addresses", async () => {
      await expect(
        assertSafeUrl("https://empty.example", resolverReturning([]))
      ).rejects.toMatchObject({ reason: "unresolvable_host" });
    });
  });

  describe("target address policy", () => {
    it("allows a public unicast target", async () => {
      await expect(
        assertSafeUrl("https://example.com", publicResolver)
      ).resolves.toBeUndefined();
    });

    it.each(["127.0.0.1", "169.254.169.254", "10.0.0.5", "192.168.1.1", "::1", "fe80::1"])(
      "blocks when resolver returns %p",
      async (address) => {
        await expect(
          assertSafeUrl("https://example.com", resolverReturning([address]))
        ).rejects.toMatchObject({ reason: "unsafe_target" });
      }
    );

    it("blocks when any of several resolved addresses is private", async () => {
      await expect(
        assertSafeUrl(
          "https://example.com",
          resolverReturning(["93.184.216.34", "10.0.0.5"])
        )
      ).rejects.toMatchObject({ reason: "unsafe_target" });
    });

    it("blocks a literal private IP embedded directly in the URL", async () => {
      await expect(
        assertSafeUrl(
          "http://169.254.169.254/latest/meta-data",
          resolverReturning(["169.254.169.254"])
        )
      ).rejects.toMatchObject({ reason: "unsafe_target" });
    });
  });

  it("returns an UnsafeUrlError instance (discriminable by callers)", async () => {
    try {
      await assertSafeUrl("ftp://example.com", publicResolver);
      fail("expected assertSafeUrl to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(UnsafeUrlError);
      expect((err as UnsafeUrlError).reason).toBe("unsafe_protocol");
    }
  });
});

describe("isSyncSafeUrl", () => {
  it("allows a public-looking DNS hostname (deferred to async path)", () => {
    expect(isSyncSafeUrl("https://example.com/page")).toBe(true);
  });

  it("allows a public IP literal", () => {
    expect(isSyncSafeUrl("https://8.8.8.8/path")).toBe(true);
  });

  it.each([
    "http://127.0.0.1/",
    "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.5/",
    "http://[::1]/",
    "http://[fe80::1]/",
  ])("blocks literal private-IP host %p", (raw) => {
    expect(isSyncSafeUrl(raw)).toBe(false);
  });

  it.each(["ftp://example.com", "file:///etc/passwd", "javascript:alert(1)"])(
    "blocks non-http(s) protocol %p",
    (raw) => {
      expect(isSyncSafeUrl(raw)).toBe(false);
    }
  );

  it.each(["not a url", "http://", ""])("blocks unparseable %p", (raw) => {
    expect(isSyncSafeUrl(raw)).toBe(false);
  });
});
