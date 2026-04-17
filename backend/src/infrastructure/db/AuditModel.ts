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

// The hot list query is find({ clientId }).sort({ createdAt: -1 }).limit(50) from
// GET /api/audits. A compound index on (clientId, createdAt desc) serves it
// directly. By prefix rule it also covers plain clientId lookups, so a separate
// clientId index would be redundant.
AuditSchema.index({ clientId: 1, createdAt: -1 });

export type AuditDoc = InferSchemaType<typeof AuditSchema> & { _id: unknown };
export const AuditModel = model("Audit", AuditSchema);
