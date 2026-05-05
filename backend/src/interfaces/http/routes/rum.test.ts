import "express-async-errors";
import express from "express";
import request from "supertest";
import {
  webVitalCls,
  webVitalLcpSeconds,
  webVitalRejectedTotal,
} from "@/infrastructure/metrics/registry";
import { rumRouter } from "./rum";

function buildApp() {
  const app = express();
  app.use(express.json({ limit: "4kb" }));
  app.use("/api/rum", rumRouter);
  return app;
}

interface MetricLike {
  get: () => Promise<{ values: unknown[] }>;
}

async function readSampleSum(metric: MetricLike, baseName: string, route: string): Promise<number> {
  const obj = await metric.get();
  const samples = obj.values as Array<{
    value: number;
    metricName?: string;
    labels: Record<string, string>;
  }>;
  const sample = samples.find(
    (v) => v.metricName === `${baseName}_sum` && v.labels.route === route
  );
  return sample?.value ?? 0;
}

describe("POST /api/rum", () => {
  beforeEach(() => {
    webVitalLcpSeconds.reset();
    webVitalCls.reset();
    webVitalRejectedTotal.reset();
  });

  it("returns 204 for a valid LCP beacon and observes the metric", async () => {
    const res = await request(buildApp())
      .post("/api/rum")
      .set("content-type", "application/json")
      .send({ name: "LCP", value: 2100, route: "/app" });

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
    const sum = await readSampleSum(webVitalLcpSeconds, "web_vital_lcp_seconds", "/app");
    expect(sum).toBeCloseTo(2.1, 5);
  });

  it("returns 204 for a valid CLS beacon (no division)", async () => {
    const res = await request(buildApp())
      .post("/api/rum")
      .send({ name: "CLS", value: 0.05, route: "/" });

    expect(res.status).toBe(204);
    const sum = await readSampleSum(webVitalCls, "web_vital_cls", "/");
    expect(sum).toBeCloseTo(0.05, 5);
  });

  it("returns 204 (not 4xx) on malformed JSON shape, no metric observed", async () => {
    const res = await request(buildApp()).post("/api/rum").send({ wrong: "shape" });
    expect(res.status).toBe(204);
    const sum = await readSampleSum(webVitalLcpSeconds, "web_vital_lcp_seconds", "/app");
    expect(sum).toBe(0);
  });

  it("does not observe the metric when validation rejects (unknown route)", async () => {
    await request(buildApp())
      .post("/api/rum")
      .send({ name: "LCP", value: 1000, route: "/admin/queues" });
    const sum = await readSampleSum(webVitalLcpSeconds, "web_vital_lcp_seconds", "/admin/queues");
    expect(sum).toBe(0);
  });

  it("returns 204 for an empty body", async () => {
    const res = await request(buildApp()).post("/api/rum").send({});
    expect(res.status).toBe(204);
  });
});
