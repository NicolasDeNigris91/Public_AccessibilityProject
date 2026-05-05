import { Schema, model, Types, InferSchemaType } from "mongoose";

const SessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
    expiresAt: { type: Date, required: true },
    lastUsedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true }
);

SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
SessionSchema.index({ userId: 1 });

export type SessionDoc = InferSchemaType<typeof SessionSchema> & { _id: Types.ObjectId };
export const SessionModel = model("Session", SessionSchema);
