import { AUDIT_TITLE_FALLBACK, auditTitle } from "./auditTitle";

describe("auditTitle", () => {
  it("formats a https URL using the bare hostname", () => {
    expect(auditTitle("https://example.com/about")).toBe("Auditoria de example.com — Euthus");
  });

  it("strips port and path from the title", () => {
    expect(auditTitle("https://example.com:8080/foo/bar?q=1")).toBe(
      "Auditoria de example.com — Euthus"
    );
  });

  it("preserves subdomains", () => {
    expect(auditTitle("https://sub.example.co.uk/")).toBe(
      "Auditoria de sub.example.co.uk — Euthus"
    );
  });

  it("works with http (not just https)", () => {
    expect(auditTitle("http://example.com")).toBe("Auditoria de example.com — Euthus");
  });

  it("returns fallback for undefined", () => {
    expect(auditTitle(undefined)).toBe(AUDIT_TITLE_FALLBACK);
  });

  it("returns fallback for empty string", () => {
    expect(auditTitle("")).toBe(AUDIT_TITLE_FALLBACK);
  });

  it("returns fallback for malformed URL", () => {
    expect(auditTitle("not a url")).toBe(AUDIT_TITLE_FALLBACK);
  });

  it("returns fallback for URL whose hostname is empty (file:// edge)", () => {
    // file:// URLs parse with an empty hostname.
    expect(auditTitle("file:///etc/passwd")).toBe(AUDIT_TITLE_FALLBACK);
  });
});
