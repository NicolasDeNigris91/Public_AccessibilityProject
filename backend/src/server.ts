// Telemetry MUST be the very first import so the OTel hooks wrap
// express / mongoose / ioredis before they load. See instrumentationApi.ts.
import "@/instrumentationApi";
import "express-async-errors";
import http from "node:http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import { env } from "@/config/env";
import { logger } from "@/config/logger";
import { connectMongo, pingMongo } from "@/infrastructure/db/mongo";
import { AuditModel } from "@/infrastructure/db/AuditModel";
import { redisConnection } from "@/infrastructure/queue/connection";
import { auditsRouter } from "@/interfaces/http/routes/audits";
import { rumRouter } from "@/interfaces/http/routes/rum";
import { auditEventsRouter } from "@/interfaces/http/routes/auditEvents";
import { buildAuthRouter } from "@/interfaces/http/routes/auth";
import * as auditEventsBus from "@/infrastructure/queue/auditEventsBus";
import { errorHandler } from "@/interfaces/http/middlewares/errorHandler";
import { requestId } from "@/interfaces/http/middlewares/requestId";
import { optionalSession } from "@/interfaces/http/middlewares/optionalSession";
import { ipEmailRateLimit } from "@/interfaces/http/middlewares/ipEmailRateLimit";
import { ipRateLimit } from "@/interfaces/http/middlewares/ipRateLimit";
import { mountSwagger } from "@/interfaces/http/swagger";
import { mountQueuesUI } from "@/interfaces/http/admin/queuesUI";
import { auditQueue } from "@/infrastructure/queue/auditQueue";
import { httpMetricsMiddleware } from "@/infrastructure/metrics/httpMetrics";
import { registry } from "@/infrastructure/metrics/registry";
import { startQueueDepthSampler } from "@/infrastructure/metrics/queueDepth";
import { createEmailSender } from "@/infrastructure/email/factory";
import { LastLinkCapture } from "@/infrastructure/email/lastLinkCapture";
import type { EmailSender } from "@/infrastructure/email/EmailSender";

// Time the API has to drain in-flight requests on SIGTERM before the
// orchestrator sends SIGKILL. Match Railway's grace window (~30s).
const SHUTDOWN_TIMEOUT_MS = 25_000;

async function main() {
  await connectMongo();
  // Indexes are owned by migrations (backend/migrations/) in production.
  // Keep an opt-in syncIndexes for dev convenience so the local docker-
  // compose flow doesn't require running migrations manually.
  if (env.NODE_ENV !== "production") {
    await AuditModel.syncIndexes();
  }

  const app = express();

  // Behind a reverse proxy, trust X-Forwarded-For so rate-limit sees the real client IP.
  if (env.TRUST_PROXY) app.set("trust proxy", 1);

  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()),
      credentials: true,
    })
  );

  // Strict CSP for API and app routes; Swagger UI ships its own loose policy
  // and is mounted with a relaxed helmet under /docs (see mountSwagger).
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "default-src": ["'none'"],
          "frame-ancestors": ["'none'"],
          "base-uri": ["'none'"],
          "form-action": ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: "same-site" },
      referrerPolicy: { policy: "no-referrer" },
    })
  );
  app.use(express.json({ limit: "32kb" }));
  app.use(cookieParser());
  app.use(requestId);
  // Record duration before any route runs so even rate-limited requests are
  // observed.
  app.use(httpMetricsMiddleware);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as { requestId?: string }).requestId ?? "unknown",
    })
  );

  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  // Resolves the session cookie into req.userId / req.userEmail when present.
  // Mounted globally so routes downstream (auth + audits) can read it without
  // remounting per-route.
  app.use(optionalSession);

  // Soft-auth wiring. createEmailSender returns null in production when
  // EMAIL_PROVIDER is unset; the route 503s loudly so misconfig never
  // silently degrades to a console log of magic-links. Outside production
  // we wrap whatever sender came back with LastLinkCapture so the e2e
  // hatch can read the last link per email — never wired in prod.
  const baseSender: EmailSender | null = createEmailSender({
    NODE_ENV: env.NODE_ENV,
    ...(env.EMAIL_PROVIDER !== undefined ? { EMAIL_PROVIDER: env.EMAIL_PROVIDER } : {}),
    ...(env.RESEND_API_KEY !== undefined ? { RESEND_API_KEY: env.RESEND_API_KEY } : {}),
    ...(env.EMAIL_FROM !== undefined ? { EMAIL_FROM: env.EMAIL_FROM } : {}),
  });
  const isProd = env.NODE_ENV === "production";
  const linkCapture = !isProd && baseSender ? new LastLinkCapture(baseSender) : null;
  const authSender: EmailSender | null = linkCapture ?? baseSender;

  app.use(
    "/api/auth",
    buildAuthRouter({
      sender: authSender,
      webBaseUrl: env.WEB_BASE_URL,
      appRedirectUrl: env.APP_REDIRECT_URL,
      cookieSecure: isProd,
      cookieMaxAgeSec: Math.floor(env.SESSION_TTL_MS / 1000),
      ...(env.AUTH_COOKIE_DOMAIN ? { cookieDomain: env.AUTH_COOKIE_DOMAIN } : {}),
      magicLinkTtlMs: env.MAGIC_LINK_TTL_MS,
      sessionTtlMs: env.SESSION_TTL_MS,
      magicLinkRateLimiter: ipEmailRateLimit({
        redis: redisConnection,
        max: env.AUTH_RATE_LIMIT_MAX,
        windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
        keyPrefix: "rl:auth:magic-link",
      }),
      verifyRateLimiter: ipRateLimit({
        redis: redisConnection,
        max: env.AUTH_VERIFY_RATE_LIMIT_MAX,
        windowMs: env.AUTH_VERIFY_RATE_LIMIT_WINDOW_MS,
        keyPrefix: "rl:auth:verify",
      }),
      ...(linkCapture ? { lastLinkLookup: (e: string) => linkCapture.lookup(e) } : {}),
    })
  );

  /**
   * @openapi
   * /health:
   *   get:
   *     summary: Liveness probe (the process is up and serving)
   *     description: Always returns 200 while the event loop is responsive. Use this
   *       as the container liveness probe. Dependency health is at /ready.
   *     tags: [System]
   *     responses:
   *       200: { description: OK }
   */
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", uptime: process.uptime() });
  });

  /**
   * @openapi
   * /ready:
   *   get:
   *     summary: Readiness probe (Mongo and Redis reachable)
   *     description: Returns 200 only when every downstream the API needs to serve a
   *       request is reachable. Use this as the load-balancer readiness probe so
   *       traffic is not routed to an instance whose DB or queue is down.
   *     tags: [System]
   *     responses:
   *       200: { description: All dependencies reachable }
   *       503: { description: One or more dependencies unreachable }
   */
  app.get("/ready", async (_req, res) => {
    const [redisOk, mongoOk, queueOk] = await Promise.all([
      redisConnection
        .ping()
        .then((r) => r === "PONG")
        .catch(() => false),
      pingMongo(),
      // Queue health goes beyond Redis ping: BullMQ has its own client + key
      // namespace and can be wedged when Redis is otherwise responsive.
      auditQueue
        .getJobCounts("wait", "active")
        .then(() => true)
        .catch(() => false),
    ]);
    const ready = redisOk && mongoOk && queueOk;
    res.status(ready ? 200 : 503).json({
      status: ready ? "ready" : "degraded",
      redis: redisOk,
      mongo: mongoOk,
      queue: queueOk,
      uptime: process.uptime(),
    });
  });

  // Prometheus scrape target. Plain text/openmetrics body; not behind the
  // rate limit because Grafana Agent / k8s scrapers hit it every 15-30s.
  app.get("/metrics", async (_req, res) => {
    res.set("Content-Type", registry.contentType);
    res.end(await registry.metrics());
  });

  // Mount SSE event stream BEFORE the json/rate-limit-protected
  // routes since the long-lived connection should not consume an
  // entry from the per-IP minute window. Body limit doesn't matter
  // for GETs, but ordering keeps it explicit.
  app.use("/api/audits", auditEventsRouter);
  app.use("/api/audits", auditsRouter);
  // RUM beacon endpoint: tiny JSON, no auth, fire-and-forget. Sits
  // under the IP-level rate-limit (mounted globally above) so a noisy
  // sender can be capped without per-route knobs.
  app.use("/api/rum", rumRouter);
  // Swagger UI requires inline styles; relax CSP only on the /docs subtree.
  mountSwagger(app);
  // Bull-Board admin UI behind basic auth. Skipped silently if the
  // ADMIN_USER / ADMIN_PASS env pair isn't configured, so a forgotten
  // env in prod never serves the admin UI without credentials.
  const adminMounted = mountQueuesUI(app, {
    user: env.ADMIN_USER,
    pass: env.ADMIN_PASS,
  });
  if (adminMounted) {
    logger.info("admin queues UI mounted at /admin/queues");
  } else {
    logger.info("admin queues UI not mounted (ADMIN_USER / ADMIN_PASS not set)");
  }
  app.use(errorHandler);

  const queueDepthHandle = startQueueDepthSampler(auditQueue);

  const server = http.createServer(app);
  server.listen(env.PORT, () => logger.info({ port: env.PORT }, "api listening"));

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "api shutting down");
    let exitCode = 0;
    const force = setTimeout(() => {
      logger.warn({ timeoutMs: SHUTDOWN_TIMEOUT_MS }, "shutdown timed out, forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    force.unref();
    try {
      clearInterval(queueDepthHandle);
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
      await auditEventsBus
        .stop()
        .catch((err) => logger.warn({ err }, "audit events bus stop failed"));
      await mongoose
        .disconnect()
        .catch((err) => logger.warn({ err }, "mongoose disconnect failed"));
      await redisConnection.quit().catch((err) => logger.warn({ err }, "redis quit failed"));
    } catch (err) {
      logger.error({ err }, "error during shutdown");
      exitCode = 1;
    } finally {
      clearTimeout(force);
      logger.info({ exitCode }, "api shutdown complete");
      process.exit(exitCode);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.fatal({ err }, "api boot failed");
  process.exit(1);
});
