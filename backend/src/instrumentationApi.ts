// IMPORTANT: this file must be the FIRST import in src/server.ts.
// startTelemetry has to install the OTel hooks BEFORE express,
// mongoose, ioredis are loaded — otherwise auto-instrumentation
// can't wrap them.
import { startTelemetry } from "@/infrastructure/telemetry/tracer";

startTelemetry({ serviceName: "euthus-api" });
