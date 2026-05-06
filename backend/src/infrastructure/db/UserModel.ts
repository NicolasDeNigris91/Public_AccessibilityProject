import { Schema, model, InferSchemaType } from "mongoose";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const UserSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      validate: { validator: (v: string) => EMAIL_REGEX.test(v), message: "invalid email" },
    },
  },
  { timestamps: true }
);

export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: unknown };
export const UserModel = model("User", UserSchema);
