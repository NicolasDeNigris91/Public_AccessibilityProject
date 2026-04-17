import "express-async-errors";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { env } from "@/config/env";
import { logger } from "@/config/logger";
import { connectMongo, pingMongo } from "@/infrastructure/db/mongo";
import { AuditModel } from "@/infrastructure/db/AuditModel";
import { redisConnection } from "@/infrastructure/queue/connection";
import { auditsRouter } from "@/interfaces/http/routes/audits";
import { errorHandler } from "@/interfaces/http/middlewares/errorHandler";
import { mountSwagger } from "@/interfaces/http/swagger";

async function main() {
  await connectMongo();
  await AuditModel.syncIndexes();

  const app = express();

  // Railway (and most PaaS) sit behind a reverse proxy — required so Express
  // reads the real client IP from X-Forwarded-For (used by rate-limit) instead
  // of treating every request as coming from the proxy's IP.
  if (env.TRUST_PROXY) app.set("trust proxy", 1);

  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()),
      credentials: true,
    })
  );
  app.use(
    helmet({
      // Swagger UI needs inline styles/scripts; scoped CSP is configured per-route below.
      contentSecurityPolicy: false,
    })
  );
  app.use(express.json({ limit: "32kb" }));
  app.use(pinoHttp({ logger }));

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
  mountSwagger(app);
  app.use(errorHandler);

  app.listen(env.PORT, () => logger.info({ port: env.PORT }, "api listening"));
}

main().catch((err) => {
  logger.fatal({ err }, "api boot failed");
  process.exit(1);
});
