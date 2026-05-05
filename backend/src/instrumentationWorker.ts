// IMPORTANT: this file must be the FIRST import in src/workers/auditWorker.ts.
// startTelemetry has to install the OTel hooks BEFORE puppeteer,
// mongoose, bullmq, ioredis are loaded — otherwise auto-instrumentation
// can't wrap them.
import { startTelemetry } from "@/infrastructure/telemetry/tracer";

startTelemetry({ serviceName: "euthus-worker" });
