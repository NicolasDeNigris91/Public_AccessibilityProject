import "express-async-errors";
import http from "node:http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import mongoose from "mongoose";
import { env } from "@/config/env";
import { logger } from "@/config/logger";
import { connectMongo, pingMongo } from "@/infrastructure/db/mongo";
import { AuditModel } from "@/infrastructure/db/AuditModel";
import { redisConnection } from "@/infrastructure/queue/connection";
import { auditsRouter } from "@/interfaces/http/routes/audits";
import { errorHandler } from "@/interfaces/http/middlewares/errorHandler";
import { requestId } from "@/interfaces/http/middlewares/requestId";
import { mountSwagger } from "@/interfaces/http/swagger";

// Time the API has to drain in-flight requests on SIGTERM before the
// orchestrator sends SIGKILL. Match Railway's grace window (~30s).
const SHUTDOWN_TIMEOUT_MS = 25_000;

async function main() {
  await connectMongo();
  await AuditModel.syncIndexes();

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
  app.use(requestId);
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
    const [redisOk, mongoOk] = await Promise.all([
      redisConnection
        .ping()
        .then((r) => r === "PONG")
        .catch(() => false),
      pingMongo(),
    ]);
    const ready = redisOk && mongoOk;
    res.status(ready ? 200 : 503).json({
      status: ready ? "ready" : "degraded",
      redis: redisOk,
      mongo: mongoOk,
      uptime: process.uptime(),
    });
  });

  app.use("/api/audits", auditsRouter);
  // Swagger UI requires inline styles; relax CSP only on the /docs subtree.
  mountSwagger(app);
  app.use(errorHandler);

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
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
      await mongoose.disconnect().catch((err) =>
        logger.warn({ err }, "mongoose disconnect failed")
      );
      await redisConnection.quit().catch((err) =>
        logger.warn({ err }, "redis quit failed")
      );
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
