import { isBlockedIp, isLiteralIp } from "./urlSafety";

describe("isBlockedIp (IPv4)", () => {
  it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34"])(
    "allows public unicast %s",
    (ip) => {
      expect(isBlockedIp(ip)).toBe(false);
    }
  );

  it.each(["127.0.0.1", "127.10.20.30"])("blocks loopback %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each([
    "10.0.0.1",
    "10.255.255.255",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.0.1",
    "192.168.1.100",
  ])("blocks RFC1918 private %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it("blocks the cloud metadata endpoint 169.254.169.254", () => {
    expect(isBlockedIp("169.254.169.254")).toBe(true);
  });

  it("blocks carrier-grade NAT 100.64.0.1", () => {
    expect(isBlockedIp("100.64.0.1")).toBe(true);
  });

  it("blocks broadcast 255.255.255.255", () => {
    expect(isBlockedIp("255.255.255.255")).toBe(true);
  });

  it("blocks unspecified 0.0.0.0", () => {
    expect(isBlockedIp("0.0.0.0")).toBe(true);
  });

  it("blocks multicast 224.0.0.1", () => {
    expect(isBlockedIp("224.0.0.1")).toBe(true);
  });
});

describe("isBlockedIp (IPv6)", () => {
  it("allows public 2606:4700:4700::1111", () => {
    expect(isBlockedIp("2606:4700:4700::1111")).toBe(false);
  });

  it("blocks loopback ::1", () => {
    expect(isBlockedIp("::1")).toBe(true);
  });

  it("blocks link-local fe80::1", () => {
    expect(isBlockedIp("fe80::1")).toBe(true);
  });

  it("blocks unique local fc00::1", () => {
    expect(isBlockedIp("fc00::1")).toBe(true);
  });

  it("blocks IPv4-mapped loopback ::ffff:127.0.0.1", () => {
    expect(isBlockedIp("::ffff:127.0.0.1")).toBe(true);
  });

  it("blocks IPv4-mapped cloud metadata ::ffff:169.254.169.254", () => {
    expect(isBlockedIp("::ffff:169.254.169.254")).toBe(true);
  });
});

describe("isBlockedIp (defensive)", () => {
  it.each(["", "not-an-ip", "999.999.999.999", "::gg"])(
    "blocks unparseable input %p",
    (input) => {
      expect(isBlockedIp(input)).toBe(true);
    }
  );
});

describe("isLiteralIp", () => {
  it.each(["8.8.8.8", "127.0.0.1", "::1", "2606:4700:4700::1111"])(
    "recognises %s as an IP literal",
    (ip) => {
      expect(isLiteralIp(ip)).toBe(true);
    }
  );

  it.each(["example.com", "localhost", "", "not-an-ip"])(
    "rejects non-literal host %p",
    (host) => {
      expect(isLiteralIp(host)).toBe(false);
    }
  );
});
