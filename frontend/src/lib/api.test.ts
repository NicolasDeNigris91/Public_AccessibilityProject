/**
 * @jest-environment jsdom
 */
import { ApiError, apiFetch, fetcher, postJson } from "./api";

describe("apiFetch", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("euthus-client-id", "550e8400-e29b-41d4-a716-446655440000");
  });

  it("adds X-Client-Id header on GET", async () => {
    const mock = jest
      .fn()
      .mockResolvedValue(
        new Response("{}", { status: 200, headers: { "content-type": "application/json" } })
      );
    global.fetch = mock as unknown as typeof fetch;

    await apiFetch("https://api.example.com/x");

    const [, init] = mock.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get("x-client-id")).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("preserves caller-provided headers on POST", async () => {
    const mock = jest.fn().mockResolvedValue(new Response("{}", { status: 202 }));
    global.fetch = mock as unknown as typeof fetch;

    await apiFetch("https://api.example.com/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });

    const [, init] = mock.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-client-id")).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(init.method).toBe("POST");
  });
});

describe("fetcher", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("euthus-client-id", "550e8400-e29b-41d4-a716-446655440000");
  });

  it("returns parsed JSON on 2xx", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    ) as unknown as typeof fetch;

    await expect(fetcher<{ ok: boolean }>("https://api.example.com/x")).resolves.toEqual({
      ok: true,
    });
  });

  it("throws on non-2xx with no body (bare-status fallback)", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response("nope", { status: 400 })) as unknown as typeof fetch;

    await expect(fetcher("https://api.example.com/x")).rejects.toThrow("API error 400");
  });

  it("throws ApiError carrying the status code", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response("nope", { status: 404 })) as unknown as typeof fetch;

    await expect(fetcher("https://api.example.com/x")).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
    });
  });

  it("parses the structured error envelope from the response body", async () => {
    const body = {
      error: { code: "unsafe_target", message: "URL points to private network" },
      requestId: "req-abc-123",
    };
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 400,
        headers: { "content-type": "application/json" },
      })
    ) as unknown as typeof fetch;

    await expect(fetcher("https://api.example.com/x")).rejects.toMatchObject({
      name: "ApiError",
      status: 400,
      code: "unsafe_target",
      requestId: "req-abc-123",
      message: "URL points to private network",
    });
  });

  it("ApiError is an Error subclass (instanceof check for callers)", () => {
    const err = new ApiError(500);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(500);
  });

  it("ApiError without body leaves code and requestId undefined", () => {
    const err = new ApiError(500);
    expect(err.code).toBeUndefined();
    expect(err.requestId).toBeUndefined();
    expect(err.message).toBe("API error 500");
  });
});

describe("postJson", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("euthus-client-id", "550e8400-e29b-41d4-a716-446655440000");
  });

  it("sends POST with JSON content-type and X-Client-Id, returns parsed body on 2xx", async () => {
    const mock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ publicId: "abc", status: "queued" }), {
        status: 202,
        headers: { "content-type": "application/json" },
      })
    );
    global.fetch = mock as unknown as typeof fetch;

    await expect(
      postJson<{ publicId: string }>("https://api.example.com/api/audits", {
        url: "https://example.com",
      })
    ).resolves.toEqual({ publicId: "abc", status: "queued" });

    const [, init] = mock.mock.calls[0];
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-client-id")).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(init.body).toBe(JSON.stringify({ url: "https://example.com" }));
  });

  it("throws ApiError carrying the envelope code on 4xx", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "unsafe_target", message: "private network" },
          requestId: "req-1",
        }),
        { status: 400, headers: { "content-type": "application/json" } }
      )
    ) as unknown as typeof fetch;

    await expect(postJson("https://api.example.com/x", {})).rejects.toMatchObject({
      name: "ApiError",
      status: 400,
      code: "unsafe_target",
      requestId: "req-1",
    });
  });

  it("throws ApiError on 4xx even when the body is non-JSON (rate-limit default)", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response("Too many requests, please try again later.", { status: 429 })
      ) as unknown as typeof fetch;

    await expect(postJson("https://api.example.com/x", {})).rejects.toMatchObject({
      name: "ApiError",
      status: 429,
      code: undefined,
    });
  });
});
