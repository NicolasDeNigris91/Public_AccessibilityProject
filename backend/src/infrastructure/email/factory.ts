import { Resend } from "resend";
import { ConsoleSender } from "./consoleSender";
import { ResendSender } from "./resendSender";
import { CircuitBreakerSender } from "./CircuitBreakerSender";
import type { EmailSender } from "./EmailSender";
import { logger } from "@/config/logger";

interface FactoryEnv {
  NODE_ENV: "development" | "production" | "test";
  EMAIL_PROVIDER?: "resend" | undefined;
  RESEND_API_KEY?: string | undefined;
  EMAIL_FROM?: string | undefined;
}

// Circuit-breaker thresholds for the production resend path. Five
// consecutive failures opens the circuit; a 30-second cooldown keeps
// us from hammering a degraded provider while still recovering quickly
// once it's healthy again. Values are intentionally not env-tunable —
// they're operational constants chosen against Resend's documented
// behavior, and changing them is a code review.
const RESEND_FAILURE_THRESHOLD = 5;
const RESEND_COOLDOWN_MS = 30_000;

/**
 * Returns null only in production when no provider is configured.
 * The auth route MUST treat null as "respond 503 with hint" so a
 * misconfigured prod fails loud at request time rather than silently
 * leaking magic links to the application log.
 *
 * In production the resend path is wrapped by a circuit breaker so a
 * provider outage fails fast (CircuitOpenError) after the threshold
 * instead of timing out per-request and piling on a degraded
 * upstream. Dev / test paths run unwrapped — fast feedback matters
 * more than reliability there, and the console sender doesn't fail.
 */
export function createEmailSender(env: FactoryEnv): EmailSender | null {
  if (env.EMAIL_PROVIDER === "resend") {
    if (!env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY required when EMAIL_PROVIDER=resend");
    }
    if (!env.EMAIL_FROM) {
      throw new Error("EMAIL_FROM required when EMAIL_PROVIDER=resend");
    }
    const inner = new ResendSender(new Resend(env.RESEND_API_KEY), env.EMAIL_FROM);
    return new CircuitBreakerSender(inner, {
      failureThreshold: RESEND_FAILURE_THRESHOLD,
      cooldownMs: RESEND_COOLDOWN_MS,
    });
  }
  if (env.NODE_ENV === "production") return null;
  return new ConsoleSender(logger);
}
