import { Schema, model, InferSchemaType } from "mongoose";

const MagicLinkSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    clientId: { type: String },
    /**
     * Optional `Idempotency-Key` header captured at POST time. When set,
     * a subsequent POST with the same (email, idempotencyKey) inside the
     * link's TTL is treated as a duplicate and returns 202 without
     * re-sending email — neutralises double-form-submit and naive client
     * retries without burning rate-limit budget on the second copy.
     */
    idempotencyKey: { type: String },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Mongo reaps documents whose `expiresAt` is in the past — the unused
// link disappears 15 min after issuance, the used link disappears
// shortly after `usedAt` (we keep `usedAt` for audit trail until TTL
// fires).
MagicLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Speeds up email-recent-link lookups for the per-email rate-limit.
MagicLinkSchema.index({ email: 1, createdAt: -1 });
// Partial index for the idempotency dedupe lookup: only indexes docs
// that actually carry an `idempotencyKey`, so legacy / non-keyed
// requests don't bloat the index. Email is the partition key — two
// distinct users may legitimately share an `idempotencyKey` (header
// is client-supplied) and we never want one user's idempotency state
// to leak into the other's lookup.
MagicLinkSchema.index(
  { email: 1, idempotencyKey: 1 },
  { partialFilterExpression: { idempotencyKey: { $type: "string" } } }
);

export type MagicLinkDoc = InferSchemaType<typeof MagicLinkSchema> & { _id: unknown };
export const MagicLinkModel = model("MagicLink", MagicLinkSchema);
