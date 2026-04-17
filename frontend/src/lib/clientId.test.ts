/**
 * @jest-environment jsdom
 */
import { getClientId } from "./clientId";

describe("getClientId", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("generates a new UUID and persists it on first call", () => {
    const id = getClientId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(localStorage.getItem("euthus-client-id")).toBe(id);
  });

  it("returns the same id on subsequent calls", () => {
    const a = getClientId();
    const b = getClientId();
    expect(a).toBe(b);
  });

  it("reads an existing value from localStorage verbatim", () => {
    const existing = "550e8400-e29b-41d4-a716-446655440000";
    localStorage.setItem("euthus-client-id", existing);
    expect(getClientId()).toBe(existing);
  });
});
