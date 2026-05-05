/**
 * @jest-environment jsdom
 */
import { routeKeyFromPath, sendVitalBeacon } from "./rum";

describe("routeKeyFromPath", () => {
  it.each([
    ["/", "/"],
    ["/aprender", "/aprender"],
    ["/app", "/app"],
    ["/audits/abc-123", "/audits/[id]"],
    ["/audits/550e8400-e29b-41d4-a716-446655440000", "/audits/[id]"],
    ["/audits/abc-123/", "/audits/[id]"],
  ])("maps %p to %p", (path, expected) => {
    expect(routeKeyFromPath(path)).toBe(expected);
  });

  it.each([
    "/foo",
    "/audits",
    "/audits/",
    "/audits/abc/extra",
    "/admin/queues",
    "javascript:alert(1)",
  ])("returns null for unknown path %p", (path) => {
    expect(routeKeyFromPath(path)).toBeNull();
  });
});

describe("sendVitalBeacon", () => {
  it("posts the metric to /api/rum with the mapped route", () => {
    const send = jest.fn();
    sendVitalBeacon(
      "https://api.example.com",
      "/audits/abc-123",
      { name: "LCP", value: 2100 },
      send
    );
    expect(send).toHaveBeenCalledWith(
      "https://api.example.com/api/rum",
      JSON.stringify({ name: "LCP", value: 2100, route: "/audits/[id]" })
    );
  });

  it("does not send when the pathname can't be classified (cardinality guard)", () => {
    const send = jest.fn();
    sendVitalBeacon("https://api.example.com", "/random", { name: "LCP", value: 1 }, send);
    expect(send).not.toHaveBeenCalled();
  });

  it("swallows errors thrown by the underlying send (telemetry must not throw)", () => {
    const send = jest.fn().mockImplementation(() => {
      throw new Error("network");
    });
    expect(() =>
      sendVitalBeacon("https://api.example.com", "/", { name: "LCP", value: 1 }, send)
    ).not.toThrow();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("default send uses sendBeacon when available", () => {
    const sendBeacon = jest.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: sendBeacon,
    });
    sendVitalBeacon("https://api.example.com", "/", { name: "CLS", value: 0.05 });
    expect(sendBeacon).toHaveBeenCalledWith("https://api.example.com/api/rum", expect.any(Blob));
  });

  it("default send falls back to fetch when sendBeacon returns false", () => {
    const sendBeacon = jest.fn().mockReturnValue(false);
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: sendBeacon,
    });
    const fetchMock = jest.fn().mockResolvedValue(new Response(null, { status: 204 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    sendVitalBeacon("https://api.example.com", "/app", { name: "INP", value: 200 });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/api/rum",
      expect.objectContaining({ method: "POST", keepalive: true })
    );
  });
});
