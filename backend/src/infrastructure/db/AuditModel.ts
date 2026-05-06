import { Schema, model, InferSchemaType } from "mongoose";

const NodeSchema = new Schema(
  { target: [String], html: String, failureSummary: String },
  { _id: false }
);

const ViolationSchema = new Schema(
  {
    id: String,
    impact: { type: String, enum: ["critical", "serious", "moderate", "minor"] },
    description: String,
    helpUrl: String,
    tags: [String],
    nodes: [NodeSchema],
  },
  { _id: false }
);

const AuditSchema = new Schema(
  {
    publicId: { type: String, unique: true, required: true },
    clientId: { type: String },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    url: { type: String, required: true },
    status: { type: String, enum: ["queued", "running", "done", "failed"], default: "queued" },
    score: Number,
    totals: {
      critical: { type: Number, default: 0 },
      serious: { type: Number, default: 0 },
      moderate: { type: Number, default: 0 },
      minor: { type: Number, default: 0 },
    },
    violations: [ViolationSchema],
    passes: Number,
    durationMs: Number,
    error: String,
  },
  { timestamps: true }
);

// Serves GET /api/audits: find by clientId, sort by createdAt desc, limit 50.
AuditSchema.index({ clientId: 1, createdAt: -1 });
// Same shape, but for users who have signed in. The list endpoint
// switches between these two indexes based on whether a session
// cookie was resolved by `optionalSession`.
AuditSchema.index({ userId: 1, createdAt: -1 });

export type AuditDoc = InferSchemaType<typeof AuditSchema> & { _id: unknown };
export const AuditModel = model("Audit", AuditSchema);
