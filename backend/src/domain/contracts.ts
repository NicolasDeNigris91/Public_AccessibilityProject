import { z } from "zod";

/**
 * Wire-format contracts for the public API. These are the source of truth:
 * - Route handlers serialize through `<Schema>.parse` to guarantee the shape.
 * - Integration tests validate every response with the matching schema.
 * - Frontend `lib/types.ts` re-declares the same shapes; a contract test in
 *   the integration suite asserts the two stay aligned.
 *
 * Add a field here, parse it in the route, declare it in the frontend types,
 * and the type system + tests will catch any drift.
 */

export const SeverityZ = z.enum(["critical", "serious", "moderate", "minor"]);
export type Severity = z.infer<typeof SeverityZ>;

export const AuditStatusZ = z.enum(["queued", "running", "done", "failed"]);
export type AuditStatusContract = z.infer<typeof AuditStatusZ>;

export const SeverityTotalsZ = z.object({
  critical: z.number().int().nonnegative(),
  serious: z.number().int().nonnegative(),
  moderate: z.number().int().nonnegative(),
  minor: z.number().int().nonnegative(),
});
export type SeverityTotalsContract = z.infer<typeof SeverityTotalsZ>;

export const ViolationNodeZ = z.object({
  target: z.array(z.string()).optional(),
  html: z.string().optional(),
  failureSummary: z.string().optional(),
});

export const ViolationZ = z.object({
  id: z.string(),
  impact: SeverityZ,
  description: z.string(),
  helpUrl: z.string(),
  tags: z.array(z.string()).optional(),
  nodes: z.array(ViolationNodeZ),
});
export type ViolationContract = z.infer<typeof ViolationZ>;

/**
 * GET /api/audits — list of audit summaries owned by the calling client.
 * No violations field; that is fetched per-audit via /api/audits/:publicId.
 */
export const AuditSummaryZ = z.object({
  publicId: z.string(),
  url: z.string(),
  status: AuditStatusZ,
  score: z.number().int().min(0).max(100).optional(),
  totals: SeverityTotalsZ.optional(),
  createdAt: z.string(),
});
export type AuditSummaryContract = z.infer<typeof AuditSummaryZ>;

export const AuditListZ = z.array(AuditSummaryZ).max(50);

/**
 * GET /api/audits/:publicId — full audit doc, public by publicId.
 * Mongoose adds extras (`_id`, `__v`, `clientId`, `updatedAt`) that we want
 * to keep filtered out of the response. The integration test asserts those
 * are absent.
 */
export const AuditDetailZ = AuditSummaryZ.extend({
  violations: z.array(ViolationZ),
  passes: z.number().int().nonnegative().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
});
export type AuditDetailContract = z.infer<typeof AuditDetailZ>;

/**
 * POST /api/audits — accepted submission acknowledgement.
 */
export const AuditAcceptedZ = z.object({
  publicId: z.string(),
  status: z.literal("queued"),
});
export type AuditAcceptedContract = z.infer<typeof AuditAcceptedZ>;

/**
 * Standard error envelope. Already documented in OpenAPI; mirrored here
 * so contract tests can validate every non-2xx response.
 */
export const ErrorEnvelopeZ = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
  requestId: z.string(),
});
export type ErrorEnvelopeContract = z.infer<typeof ErrorEnvelopeZ>;
