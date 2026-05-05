import { resolveSafeAddress } from "./resolveSafeAddress";
import { UnsafeUrlError } from "./assertSafeUrl";

describe("resolveSafeAddress", () => {
  it("returns the first address for a public host", async () => {
    const ip = await resolveSafeAddress("example.com", async () => [
      { address: "93.184.216.34" },
      { address: "151.101.0.81" },
    ]);
    expect(ip).toBe("93.184.216.34");
  });

  it("throws unsafe_target if any resolved address is private", async () => {
    await expect(
      resolveSafeAddress("evil.example", async () => [
        { address: "93.184.216.34" },
        { address: "10.0.0.1" }, // RFC1918 — refuses the whole resolution
      ])
    ).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("throws unsafe_target for AWS metadata IP", async () => {
    await expect(
      resolveSafeAddress("metadata.example", async () => [{ address: "169.254.169.254" }])
    ).rejects.toMatchObject({ reason: "unsafe_target" });
  });

  it("throws unresolvable_host when DNS rejects", async () => {
    await expect(
      resolveSafeAddress("nope.example", async () => {
        throw new Error("ENOTFOUND");
      })
    ).rejects.toMatchObject({ reason: "unresolvable_host" });
  });

  it("throws unresolvable_host when DNS returns empty", async () => {
    await expect(resolveSafeAddress("empty.example", async () => [])).rejects.toMatchObject({
      reason: "unresolvable_host",
    });
  });

  it("blocks IPv6 ULA (fc00::/7)", async () => {
    await expect(
      resolveSafeAddress("ipv6-private.example", async () => [{ address: "fd00::1" }])
    ).rejects.toMatchObject({ reason: "unsafe_target" });
  });
});
