import {
  webVitalCls,
  webVitalFcpSeconds,
  webVitalInpSeconds,
  webVitalLcpSeconds,
  webVitalRejectedTotal,
  webVitalTtfbSeconds,
} from "@/infrastructure/metrics/registry";
import { dispatchWebVital } from "./rumDispatch";

interface MetricSample {
  value: number;
  labels: Record<string, string>;
  metricName?: string;
}

interface MetricLike {
  get: () => Promise<{ values: unknown[] }>;
}

async function readSamples(metric: MetricLike): Promise<MetricSample[]> {
  const obj = await metric.get();
  return obj.values as MetricSample[];
}

async function readSum(metric: MetricLike, baseName: string, route: string): Promise<number> {
  const samples = await readSamples(metric);
  const sumSample = samples.find(
    (s) => s.metricName === `${baseName}_sum` && s.labels.route === route
  );
  return sumSample?.value ?? 0;
}

describe("dispatchWebVital", () => {
  beforeEach(() => {
    webVitalLcpSeconds.reset();
    webVitalInpSeconds.reset();
    webVitalFcpSeconds.reset();
    webVitalTtfbSeconds.reset();
    webVitalCls.reset();
    webVitalRejectedTotal.reset();
  });

  it.each([
    ["LCP", webVitalLcpSeconds, "web_vital_lcp_seconds", 1500, 1.5],
    ["INP", webVitalInpSeconds, "web_vital_inp_seconds", 220, 0.22],
    ["FCP", webVitalFcpSeconds, "web_vital_fcp_seconds", 800, 0.8],
    ["TTFB", webVitalTtfbSeconds, "web_vital_ttfb_seconds", 120, 0.12],
  ])(
    "observes %s in seconds (input is ms from web-vitals)",
    async (name, metric, base, valueMs, valueSeconds) => {
      const out = dispatchWebVital({ name, value: valueMs, route: "/app" });
      expect(out).toEqual({ ok: true, observed: name });
      const sum = await readSum(metric, base, "/app");
      expect(sum).toBeCloseTo(valueSeconds, 5);
    }
  );

  it("observes CLS as a unitless number (no division)", async () => {
    const out = dispatchWebVital({ name: "CLS", value: 0.07, route: "/" });
    expect(out).toEqual({ ok: true, observed: "CLS" });
    const sum = await readSum(webVitalCls, "web_vital_cls", "/");
    expect(sum).toBeCloseTo(0.07, 5);
  });

  it.each(["FID", "TBT", "lcp", "", "DROP TABLE"])("rejects unknown metric name %p", (name) => {
    const out = dispatchWebVital({ name, value: 1, route: "/app" });
    expect(out).toEqual({ ok: false, reason: "name" });
  });

  it.each(["/foo", "/app/extra", "javascript:alert(1)", "/audits/abc-123"])(
    "rejects unknown route %p (high-cardinality protection)",
    (route) => {
      const out = dispatchWebVital({ name: "LCP", value: 100, route });
      expect(out).toEqual({ ok: false, reason: "route" });
    }
  );

  it.each([NaN, Infinity, -1, 60_001])("rejects out-of-range value %p", (value) => {
    const out = dispatchWebVital({ name: "LCP", value, route: "/" });
    expect(out).toEqual({ ok: false, reason: "value" });
  });

  it("increments the rejected counter with the correct reason label", async () => {
    dispatchWebVital({ name: "FID", value: 1, route: "/app" });
    dispatchWebVital({ name: "LCP", value: 1, route: "/nope" });
    dispatchWebVital({ name: "LCP", value: -1, route: "/app" });
    const samples = (await readSamples(webVitalRejectedTotal)) as Array<{
      value: number;
      labels: Record<string, string>;
    }>;
    const byReason = Object.fromEntries(samples.map((s) => [s.labels.reason, s.value]));
    expect(byReason).toEqual({ name: 1, route: 1, value: 1 });
  });

  it.each(["/", "/aprender", "/app", "/audits/[id]"])(
    "accepts the documented route %p",
    (route) => {
      const out = dispatchWebVital({ name: "LCP", value: 1000, route });
      expect(out).toEqual({ ok: true, observed: "LCP" });
    }
  );
});
