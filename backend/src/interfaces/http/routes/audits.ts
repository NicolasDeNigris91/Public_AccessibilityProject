import { Router } from "express";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { assertSafeUrl, UnsafeUrlError } from "@/application/assertSafeUrl";
import { AuditModel } from "@/infrastructure/db/AuditModel";
import { auditQueue, type AuditJobData } from "@/infrastructure/queue/auditQueue";
import { auditsEnqueuedTotal } from "@/infrastructure/metrics/registry";
import { redisConnection } from "@/infrastructure/queue/connection";
import { AppError } from "../middlewares/errorHandler";
import { requireClientId } from "../middlewares/clientId";
import { clientIdRateLimit } from "../middlewares/clientIdRateLimit";

// Per-clientId cap: 30 submissions / hour. The IP-level cap (set in
// server.ts) still applies. Tightens the cap that previously trusted IP
// alone, which is trivial to bypass behind shared NAT.
const submitRateLimit = clientIdRateLimit({
  redis: redisConnection,
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyPrefix: "rl:audits:submit",
});

export const auditsRouter = Router();

const CreateAuditBody = z.object({
  url: z
    .string()
    .url()
    .refine((u) => /^https?:\/\//.test(u), "must be http(s)"),
});

/**
 * @openapi
 * /api/audits:
 *   post:
 *     summary: Enqueue a new accessibility audit
 *     tags: [Audits]
 *     parameters:
 *       - in: header
 *         name: X-Client-Id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [url]
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *                 example: https://example.com
 *     responses:
 *       202:
 *         description: Audit accepted and queued
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
auditsRouter.post("/", requireClientId, submitRateLimit, async (req, res) => {
  const parsed = CreateAuditBody.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, "invalid_url");

  try {
    await assertSafeUrl(parsed.data.url);
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw new AppError(400, err.reason);
    throw err;
  }

  const publicId = uuid();
  await AuditModel.create({
    publicId,
    clientId: req.clientId,
    url: parsed.data.url,
    status: "queued",
  });
  // exactOptionalPropertyTypes forbids passing `requestId: undefined` against
  // an optional field, so build the payload conditionally.
  const jobData: AuditJobData = { publicId, url: parsed.data.url };
  if (req.requestId !== undefined) jobData.requestId = req.requestId;
  await auditQueue.add("audit", jobData, { jobId: publicId });
  auditsEnqueuedTotal.inc();

  res.status(202).json({ publicId, status: "queued" });
});

/**
 * @openapi
 * /api/audits/{publicId}:
 *   get:
 *     summary: Get an audit by its public ID (public, shareable URL)
 *     tags: [Audits]
 *     parameters:
 *       - in: path
 *         name: publicId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Audit document
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
auditsRouter.get("/:publicId", async (req, res) => {
  // Project the AuditDetail contract explicitly. Without this, Mongoose
  // leaks _id, __v, clientId and updatedAt — the contracts.ts comment
  // claimed these were filtered, but until this commit they were not.
  const audit = await AuditModel.findOne({ publicId: req.params.publicId })
    .select("publicId url status score totals violations passes durationMs error createdAt -_id")
    .lean();
  if (!audit) throw new AppError(404, "not_found");
  res.json(audit);
});

/**
 * @openapi
 * /api/audits:
 *   get:
 *     summary: List recent audits for the caller (scoped by X-Client-Id)
 *     tags: [Audits]
 *     parameters:
 *       - in: header
 *         name: X-Client-Id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: List of audit summaries (max 50, newest first, owned by this client)
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
auditsRouter.get("/", requireClientId, async (req, res) => {
  const items = await AuditModel.find({ clientId: req.clientId })
    .sort({ createdAt: -1 })
    .limit(50)
    // Explicitly exclude Mongo internals so they cannot leak with the
    // payload. The summary contract is publicId / url / status /
    // score / totals / createdAt — nothing else.
    .select("publicId url status score totals createdAt -_id")
    .lean();
  res.json(items);
});
