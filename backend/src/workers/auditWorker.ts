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
import { assertSafeUrl, isSyncSafeUrl } from "@/application/assertSafeUrl";
import { calculateScore, countBySeverity } from "@/domain/scoring";
import { Violation, WcagSeverity } from "@/domain/types";

// Must stay under Railway's default 30s SIGKILL window so cleanup (browser close,
// mongoose disconnect) has room to run. Jobs that do not finish in time are
// force-closed; BullMQ re-queues them for the next worker to pick up.
const SHUTDOWN_TIMEOUT_MS = 25_000;

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser && browser.connected) return browser;
  browser = await puppeteer.launch({
    headless: true,
    executablePath: env.PUPPETEER_EXECUTABLE_PATH || undefined,
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
  });
  browser.on("disconnected", () => {
    logger.warn("puppeteer disconnected — will relaunch on next job");
    browser = null;
  });
  return browser;
}

interface AxeRaw {
  violations: Array<{
    id: string;
    impact: WcagSeverity | null;
    description: string;
    helpUrl: string;
    tags: string[];
    nodes: Array<{ target: string[]; html: string; failureSummary?: string }>;
  }>;
  passes: unknown[];
}

async function runAudit(url: string) {
  const start = Date.now();
  // Re-check the target at execution time in case DNS resolution changed between
  // intake and dequeue (short-window DNS rebinding).
  await assertSafeUrl(url);

  const b = await getBrowser();
  const page = await b.newPage();
  try {
    await page.setViewport({ width: 1366, height: 900 });
    // Block any subresource or redirect that tries to reach a literal private IP.
    // DNS-name subresources are allowed through here; they are a known residual risk
    // that would need a DNS-aware egress proxy to fully mitigate.
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const reqUrl = request.url();
      if (/^(data|blob):/i.test(reqUrl)) {
        request.continue().catch(() => {});
        return;
      }
      if (!isSyncSafeUrl(reqUrl)) {
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
    })) as AxeRaw;

    const violations: Violation[] = raw.violations.map((v) => ({
      id: v.id,
      impact: (v.impact ?? "minor") as WcagSeverity,
      description: v.description,
      helpUrl: v.helpUrl,
      tags: v.tags,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        html: n.html,
        failureSummary: n.failureSummary,
      })),
    }));

    return {
      score: calculateScore(violations),
      totals: countBySeverity(violations),
      violations,
      passes: raw.passes.length,
      durationMs: Date.now() - start,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

async function main() {
  await connectMongo();
  logger.info("worker starting");

  const worker = new Worker<AuditJobData>(
    AUDIT_QUEUE,
    async (job) => {
      const { publicId, url } = job.data;
      logger.info({ publicId, url }, "audit job start");
      await AuditModel.updateOne({ publicId }, { $set: { status: "running" } });
      try {
        const result = await runAudit(url);
        await AuditModel.updateOne(
          { publicId },
          { $set: { status: "done", ...result } }
        );
        logger.info({ publicId, score: result.score }, "audit job done");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await AuditModel.updateOne(
          { publicId },
          { $set: { status: "failed", error: message } }
        );
        logger.error({ err, publicId }, "audit job failed");
        throw err;
      }
    },
    {
      connection: redisConnection,
      concurrency: env.MAX_CONCURRENT_AUDITS,
    }
  );

  worker.on("failed", (job, err) => logger.error({ err, jobId: job?.id }, "job failed"));

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "worker shutting down");
    let exitCode = 0;
    try {
      await drainWithTimeout(worker, SHUTDOWN_TIMEOUT_MS);
      if (browser) await browser.close().catch((err) =>
        logger.warn({ err }, "browser close failed")
      );
      await mongoose.disconnect().catch((err) =>
        logger.warn({ err }, "mongoose disconnect failed")
      );
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
    await worker.close(true).catch((err) =>
      logger.error({ err }, "force close failed")
    );
  }
}

main().catch((err) => {
  logger.fatal({ err }, "worker boot failed");
  process.exit(1);
});
