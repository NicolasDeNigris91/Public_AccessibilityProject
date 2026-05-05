import { Schema, model, InferSchemaType } from "mongoose";

const MagicLinkSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    email: { type: String, required: true, lowercase: true, trim: true },
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

export type MagicLinkDoc = InferSchemaType<typeof MagicLinkSchema> & { _id: unknown };
export const MagicLinkModel = model("MagicLink", MagicLinkSchema);
