import { startTelemetry } from "./tracer";

describe("startTelemetry", () => {
  const originalEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const originalHeaders = process.env.OTEL_EXPORTER_OTLP_HEADERS;

  afterEach(() => {
    if (originalEndpoint === undefined) delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    else process.env.OTEL_EXPORTER_OTLP_ENDPOINT = originalEndpoint;
    if (originalHeaders === undefined) delete process.env.OTEL_EXPORTER_OTLP_HEADERS;
    else process.env.OTEL_EXPORTER_OTLP_HEADERS = originalHeaders;
  });

  it("returns undefined (no SDK) when forceDisable is true", () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "https://otel.example.com";
    expect(startTelemetry({ serviceName: "x", forceDisable: true })).toBeUndefined();
  });

  it("returns undefined (no SDK) when OTEL_EXPORTER_OTLP_ENDPOINT is unset", () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    expect(startTelemetry({ serviceName: "x" })).toBeUndefined();
  });

  it("returns undefined (no SDK) when OTEL_EXPORTER_OTLP_ENDPOINT is empty", () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "";
    expect(startTelemetry({ serviceName: "x" })).toBeUndefined();
  });
});
