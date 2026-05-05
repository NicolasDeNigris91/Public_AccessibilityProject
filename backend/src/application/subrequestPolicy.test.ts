import { classifySubrequest } from "./subrequestPolicy";

describe("classifySubrequest", () => {
  describe("allows", () => {
    it.each([
      "https://example.com/style.css",
      "http://example.com/script.js",
      "https://cdn.example.com/img.png?v=1",
      "https://example.com:8443/path",
    ])("public http(s) URL %p", (url) => {
      expect(classifySubrequest(url)).toBe("allow");
    });

    it.each([
      "data:text/css;base64,Ym9keSB7fQ==",
      "data:image/svg+xml,<svg/>",
      "blob:https://example.com/abc-123",
      "DATA:text/plain,hi",
      "BLOB:https://example.com/x",
    ])("inert scheme %p", (url) => {
      expect(classifySubrequest(url)).toBe("allow");
    });
  });

  describe("aborts", () => {
    it.each([
      // Cloud metadata endpoints
      "http://169.254.169.254/latest/meta-data/",
      "http://[fd00::1]/",
      // Loopback and link-local
      "http://127.0.0.1/",
      "http://[::1]/",
      // RFC1918
      "http://10.0.0.1/",
      "http://172.16.0.1/",
      "http://192.168.1.1/",
      // IPv4-mapped IPv6 forms of the above
      "http://[::ffff:169.254.169.254]/",
      "http://[::ffff:127.0.0.1]/",
    ])("private literal IP %p", (url) => {
      expect(classifySubrequest(url)).toBe("abort");
    });

    it.each([
      "file:///etc/passwd",
      "ftp://example.com/",
      "gopher://example.com/",
      "javascript:alert(1)",
    ])("disallowed scheme %p", (url) => {
      expect(classifySubrequest(url)).toBe("abort");
    });

    it("malformed URL", () => {
      expect(classifySubrequest("not a url at all")).toBe("abort");
    });
  });
});
