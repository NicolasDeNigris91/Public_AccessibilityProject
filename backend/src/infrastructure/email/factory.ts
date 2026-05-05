import { Resend } from "resend";
import { ConsoleSender } from "./consoleSender";
import { ResendSender } from "./resendSender";
import type { EmailSender } from "./EmailSender";
import { logger } from "@/config/logger";

interface FactoryEnv {
  NODE_ENV: "development" | "production" | "test";
  EMAIL_PROVIDER?: "resend" | undefined;
  RESEND_API_KEY?: string | undefined;
  EMAIL_FROM?: string | undefined;
}

/**
 * Returns null only in production when no provider is configured.
 * The auth route MUST treat null as "respond 503 with hint" so a
 * misconfigured prod fails loud at request time rather than silently
 * leaking magic links to the application log.
 */
export function createEmailSender(env: FactoryEnv): EmailSender | null {
  if (env.EMAIL_PROVIDER === "resend") {
    if (!env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY required when EMAIL_PROVIDER=resend");
    }
    if (!env.EMAIL_FROM) {
      throw new Error("EMAIL_FROM required when EMAIL_PROVIDER=resend");
    }
    return new ResendSender(new Resend(env.RESEND_API_KEY), env.EMAIL_FROM);
  }
  if (env.NODE_ENV === "production") return null;
  return new ConsoleSender(logger);
}
