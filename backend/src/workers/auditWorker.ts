// Telemetry MUST be the very first import so the OTel hooks wrap
// puppeteer / mongoose / ioredis / bullmq before they load.
import "@/instrumentationWorker";
import http from "node:http";
import { Worker } from "bullmq";
import mongoose from "mongoose";
import puppeteer, { Browser } from "puppeteer";
import { source as axeSource } from "axe-core";
import { env } from "@/config/env";
import { logger } from "@/config/logger";
import { connectMongo } from "@/infrastructure/db/mongo";
import { AuditModel } from "@/infrastructure/db/AuditModel";
import { redisConnection } from "@/infrastructure/queue/connection";
import { AUDIT_QUEUE, AuditJobData } from "@/infrastructure/queue/auditQueue";
import { assertSafeUrl } from "@/application/assertSafeUrl";
import { resolveSafeAddress } from "@/application/resolveSafeAddress";
import { classifySubrequest } from "@/application/subrequestPolicy";
import { buildAuditResult, type AxeRawResult } from "@/domain/axeResult";
import { puppeteerBrowserRelaunchTotal, registry } from "@/infrastructure/metrics/registry";
import { startQueueDepthSampler } from "@/infrastructure/metrics/queueDepth";
import { auditDeadQueue, auditQueue } from "@/infrastructure/queue/auditQueue";
import { withSpan } from "@/infrastructure/telemetry/spans";
import { processAuditJob } from "./dispatch";
import { moveToDeadLetterIfFinal } from "./dlq";

// Leave a few seconds for browser close + mongoose disconnect before SIGKILL.
const SHUTDOWN_TIMEOUT_MS = 25_000;

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser && browser.connected) return browser;
  if (browser !== null) puppeteerBrowserRelaunchTotal.inc();
  // exactOptionalPropertyTypes: omit executablePath when unset instead of
  // passing undefined. Puppeteer falls back to its bundled binary.
  const launchOpts: Parameters<typeof puppeteer.launch>[0] = {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-features=Crashpad,DialMediaRouteProvider",
      "--user-data-dir=/tmp/chromium",
      "--crash-dumps-dir=/tmp/chromium-crashes",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  };
  if (env.PUPPETEER_EXECUTABLE_PATH) launchOpts.executablePath = env.PUPPETEER_EXECUTABLE_PATH;
  browser = await puppeteer.launch(launchOpts);
  browser.on("disconnected", () => {
    logger.warn("puppeteer disconnected, will relaunch on next job");
    browser = null;
  });
  return browser;
}

async function runAudit(url: string) {
  return withSpan("audit.run", { "audit.url_host": new URL(url).hostname }, () =>
    runAuditInner(url)
  );
}

async function runAuditInner(url: string) {
  const start = Date.now();
  // Defense in depth against DNS rebinding:
  //   1. assertSafeUrl: same DNS check the intake did, in case anything
  //      drifted on the queue.
  //   2. resolveSafeAddress: throws if any current resolution returns a
  //      private IP, even partially. Fully pinning Chromium's resolver
  //      would require relaunching the browser per job (--host-resolver-
  //      rules) and giving up the browser-reuse perf win — the cost of
  //      pinning outweighs the residual rebinding window for this app.
  //      The logged pinned IP makes any post-incident forensics easier.
  await assertSafeUrl(url);
  const parsedUrl = new URL(url);
  const hostname = parsedUrl.hostname.replace(/^\[|\]$/g, "");
  const pinnedIp = await resolveSafeAddress(hostname);
  logger.debug({ url, pinnedIp }, "audit target resolved");

  // Isolation: a fresh BrowserContext per job means cookies, localStorage,
  // service workers and IndexedDB from one audit cannot influence the next.
  // The browser process is still reused across jobs, so we keep the launch-
  // cost amortization win.
  const b = await getBrowser();
  const context = await b.createBrowserContext();
  const page = await context.newPage();
  try {
    await page.setViewport({ width: 1366, height: 900 });
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const reqUrl = request.url();
      const decision = classifySubrequest(reqUrl);
      if (decision === "abort") {
        logger.warn({ blockedUrl: reqUrl, parentUrl: url }, "blocked unsafe subrequest");
        request.abort("blockedbyclient").catch(() => {});
        return;
      }
      request.continue().catch(() => {});
    });
    await page.goto(url, { waitUntil: "networkidle2", timeout: env.AUDIT_TIMEOUT_MS });
    await page.evaluate(axeSource);
    const raw = (await page.evaluate(async () => {
      // @ts-expect-error axe injected at runtime
      return await window.axe.run(document, { resultTypes: ["violations", "passes"] });
    })) as AxeRawResult;

    return {
      ...buildAuditResult(raw),
      durationMs: Date.now() - start,
    };
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

async function main() {
  await connectMongo();
  logger.info("worker starting");

  // Warm the browser at boot so the first real audit does not pay the
  // ~2 s puppeteer.launch latency. Failure here is non-fatal — we will
  // try again lazily when the first job arrives.
  try {
    await getBrowser();
    logger.info("puppeteer warmed");
  } catch (err) {
    logger.warn({ err }, "puppeteer warmup failed; will retry on first job");
  }

  // Worker exposes /metrics on its own port so a sidecar / Grafana Agent can
  // scrape it independently of the api. /healthz lets orchestrators know the
  // worker process is alive even when no jobs are running.
  const metricsServer = http.createServer((req, res) => {
    if (req.url === "/metrics") {
      void registry.metrics().then((body) => {
        res.writeHead(200, { "Content-Type": registry.contentType });
        res.end(body);
      });
      return;
    }
    if (req.url === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  metricsServer.listen(env.WORKER_METRICS_PORT, () =>
    logger.info({ port: env.WORKER_METRICS_PORT }, "worker metrics listening")
  );
  const queueDepthHandle = startQueueDepthSampler(auditQueue);

  const worker = new Worker<AuditJobData>(
    AUDIT_QUEUE,
    async (job) => {
      await processAuditJob(job.data, {
        runAudit,
        model: AuditModel,
        logger,
      });
    },
    {
      connection: redisConnection,
      concurrency: env.MAX_CONCURRENT_AUDITS,
    }
  );

  worker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.id }, "job failed");
    void moveToDeadLetterIfFinal(job, err, { deadQueue: auditDeadQueue, logger });
  });

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "worker shutting down");
    let exitCode = 0;
    try {
      clearInterval(queueDepthHandle);
      metricsServer.close();
      await drainWithTimeout(worker, SHUTDOWN_TIMEOUT_MS);
      if (browser)
        await browser.close().catch((err) => logger.warn({ err }, "browser close failed"));
      await mongoose
        .disconnect()
        .catch((err) => logger.warn({ err }, "mongoose disconnect failed"));
    } catch (err) {
      logger.error({ err }, "error during shutdown");
      exitCode = 1;
    } finally {
      logger.info({ exitCode }, "worker shutdown complete");
      process.exit(exitCode);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

async function drainWithTimeout(worker: Worker, timeoutMs: number): Promise<void> {
  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timeoutHandle = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  const drained = worker.close().then(() => "drained" as const);
  const outcome = await Promise.race([drained, timeout]);
  if (timeoutHandle) clearTimeout(timeoutHandle);
  if (outcome === "timeout") {
    logger.warn({ timeoutMs }, "drain timed out, force-closing worker");
    await worker.close(true).catch((err) => logger.error({ err }, "force close failed"));
  }
}

main().catch((err) => {
  logger.fatal({ err }, "worker boot failed");
  process.exit(1);
});
