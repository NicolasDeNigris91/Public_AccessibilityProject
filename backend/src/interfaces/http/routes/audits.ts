import { Router } from "express";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { AuditModel } from "@/infrastructure/db/AuditModel";
import { auditQueue } from "@/infrastructure/queue/auditQueue";
import { AppError } from "../middlewares/errorHandler";
import { requireClientId } from "../middlewares/clientId";

export const auditsRouter = Router();

const CreateAuditBody = z.object({
  url: z.string().url().refine((u) => /^https?:\/\//.test(u), "must be http(s)"),
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
 *         description: Invalid URL or missing client id
 */
auditsRouter.post("/", requireClientId, async (req, res) => {
  const parsed = CreateAuditBody.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, "invalid_url");

  const publicId = uuid();
  await AuditModel.create({
    publicId,
    clientId: req.clientId,
    url: parsed.data.url,
    status: "queued",
  });
  await auditQueue.add("audit", { publicId, url: parsed.data.url }, { jobId: publicId });

  res.status(202).json({ publicId, status: "queued" });
});

/**
 * @openapi
 * /api/audits/{publicId}:
 *   get:
 *     summary: Get an audit by its public ID (public — shareable URL)
 *     tags: [Audits]
 *     parameters:
 *       - in: path
 *         name: publicId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Audit document }
 *       404: { description: Not found }
 */
auditsRouter.get("/:publicId", async (req, res) => {
  const audit = await AuditModel.findOne({ publicId: req.params.publicId }).lean();
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
 */
auditsRouter.get("/", requireClientId, async (req, res) => {
  const items = await AuditModel.find({ clientId: req.clientId })
    .sort({ createdAt: -1 })
    .limit(50)
    .select("publicId url status score totals createdAt")
    .lean();
  res.json(items);
});
