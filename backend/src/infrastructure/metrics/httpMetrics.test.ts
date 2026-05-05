import express from "express";
import request from "supertest";
import { httpMetricsMiddleware } from "./httpMetrics";
import { httpRequestDuration, registry } from "./registry";

beforeEach(() => {
  httpRequestDuration.reset();
});

function app() {
  const a = express();
  a.use(httpMetricsMiddleware);
  a.get("/api/audits/:publicId", (_req, res) => res.status(200).json({ ok: true }));
  a.get("/api/audits", (_req, res) => res.status(400).json({}));
  // No handler for /long/...; Express returns 404 via finalhandler. The
  // middleware sees req.route undefined and falls back to the truncated path.
  return a;
}

describe("httpMetricsMiddleware", () => {
  it("records duration with route + method + status_class labels", async () => {
    await request(app()).get("/api/audits/abc-123");
    const text = await registry.metrics();
    expect(text).toMatch(
      /http_request_duration_seconds_count\{[^}]*route="\/api\/audits\/:publicId"[^}]*method="GET"[^}]*status_class="2xx"[^}]*\} 1/
    );
  });

  it("buckets 4xx separately from 2xx", async () => {
    await request(app()).get("/api/audits");
    const text = await registry.metrics();
    expect(text).toMatch(/status_class="4xx"/);
  });

  it("caps unmatched routes at 2 path segments to bound cardinality", async () => {
    await request(app()).get("/long/deep/probe/path");
    const text = await registry.metrics();
    expect(text).toMatch(/route="\/long\/deep"/);
    expect(text).not.toMatch(/route="\/long\/deep\/probe\/path"/);
  });
});
