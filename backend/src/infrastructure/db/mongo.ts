import mongoose from "mongoose";
import { env } from "@/config/env";
import { logger } from "@/config/logger";

export async function connectMongo(): Promise<void> {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.MONGO_URI, { autoIndex: false });
  logger.info({ uri: env.MONGO_URI.replace(/\/\/.*@/, "//***@") }, "mongo connected");
}

export async function pingMongo(): Promise<boolean> {
  try {
    const result = await mongoose.connection.db?.admin().ping();
    return result?.ok === 1;
  } catch {
    return false;
  }
}
