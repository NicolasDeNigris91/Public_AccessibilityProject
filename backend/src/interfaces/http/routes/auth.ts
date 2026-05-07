import { Router, type RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import mongoose from "mongoose";
import { AppError } from "../middlewares/errorHandler";
import type { EmailSender } from "@/infrastructure/email/EmailSender";
import {
  serializeSessionCookie,
  clearSessionCookie,
  SESSION_COOKIE_NAME,
} from "@/infrastructure/auth/cookies";
import { requestMagicLink } from "@/application/auth/requestMagicLink";
import { verifyMagicLink, VerifyError } from "@/application/auth/verifyMagicLink";
import { logout } from "@/application/auth/logout";
import { mergeAnonymousAudits } from "@/application/auth/mergeAnonymousAudits";

export interface AuthRouterDeps {
  /** null in prod when EMAIL_PROVIDER is unset → /magic-link 503s. */
  sender: EmailSender | null;
  webBaseUrl: string;
  appRedirectUrl: string;
  cookieSecure: boolean;
  cookieMaxAgeSec: number;
  cookieDomain?: string;
  magicLinkTtlMs: number;
  sessionTtlMs: number;
  /**
   * When provided, mounts GET /__test/last-link?email=… returning the most
   * recent magic-link URL for that email. Wired only outside production
   * (server.ts gates this) so e2e tests can complete the flow without a
   * real inbox. Absent in prod by construction → route 404s.
   */
  lastLinkLookup?: (email: string) => string | undefined;
  /**
   * Optional per-(ip, email) rate limiter, mounted before the magic-link
   * handler. Server.ts wires the Redis-backed `ipEmailRateLimit` here in
   * normal runs; tests can pass a stub. When absent the in-memory fallback
   * below runs so the route is never unbounded.
   */
  magicLinkRateLimiter?: RequestHandler;
  /**
   * Optional per-IP rate limiter for GET /verify (token brute-force defense).
   * Same DI shape as `magicLinkRateLimiter`. Server.ts wires the Redis-backed
   * `ipRateLimit` here in normal runs; tests can pass a stub. When absent the
   * in-memory fallback below runs.
   */
  verifyRateLimiter?: RequestHandler;
}

// In-memory fallbacks. These run only when DI doesn't pass a Redis-backed
// limiter (e.g. unit tests, or a misconfigured env). Production server.ts
// always overrides with cluster-safe Redis-backed limiters; these defaults
// exist so the route is never unbounded — closes the CodeQL js/missing-rate-limiting
// alerts on /magic-link and /verify.
const defaultMagicLinkLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});
const defaultVerifyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const EmailBody = z.object({ email: z.string().email().max(254) });

export function buildAuthRouter(deps: AuthRouterDeps): Router {
  const r = Router();

  r.post("/magic-link", deps.magicLinkRateLimiter ?? defaultMagicLinkLimiter, async (req, res) => {
    if (!deps.sender) {
      throw new AppError(503, "auth/email-not-configured", {
        hint: "Set EMAIL_PROVIDER=resend plus RESEND_API_KEY and EMAIL_FROM in this environment.",
      });
    }
    const parsed = EmailBody.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, "invalid_email");
    const postClientId = req.header("X-Client-Id");
    // Liberal validation on Idempotency-Key: any printable ASCII run of
    // 16-200 chars passes. Tighter formats (e.g. UUIDv4) are not enforced
    // at this layer because the dedup key is opaque from the server's
    // perspective — equality is the only operation we care about.
    const idemRaw = req.header("Idempotency-Key");
    const idempotencyKey =
      typeof idemRaw === "string" && /^[\x21-\x7E]{16,200}$/.test(idemRaw) ? idemRaw : undefined;
    await requestMagicLink({
      email: parsed.data.email,
      sender: deps.sender,
      webBaseUrl: deps.webBaseUrl,
      ttlMs: deps.magicLinkTtlMs,
      ...(postClientId ? { clientId: postClientId } : {}),
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });
    res.status(202).end();
  });

  r.get("/verify", deps.verifyRateLimiter ?? defaultVerifyLimiter, async (req, res) => {
    const rawToken = typeof req.query.token === "string" ? req.query.token : "";
    if (!rawToken) throw new AppError(400, "missing_token");
    let out;
    try {
      out = await verifyMagicLink({ rawToken, sessionTtlMs: deps.sessionTtlMs });
    } catch (err) {
      if (err instanceof VerifyError) throw new AppError(401, err.code);
      throw err;
    }

    // Link's stored clientId (captured at POST time) wins; header is the
    // legacy fallback for links issued before the field existed.
    const mergeClientId = out.clientId ?? req.header("X-Client-Id");
    if (mergeClientId) {
      await mergeAnonymousAudits({
        clientId: mergeClientId,
        userId: new mongoose.Types.ObjectId(out.userId),
      });
    }

    res.setHeader(
      "Set-Cookie",
      serializeSessionCookie(out.rawSessionToken, {
        secure: deps.cookieSecure,
        maxAgeSec: deps.cookieMaxAgeSec,
        ...(deps.cookieDomain ? { domain: deps.cookieDomain } : {}),
      })
    );
    res.redirect(302, deps.appRedirectUrl);
  });

  r.get("/me", (req, res) => {
    if (!req.userId) {
      res.json({ user: null });
      return;
    }
    res.json({ user: { id: req.userId, email: req.userEmail } });
  });

  r.post("/logout", async (req, res) => {
    const raw = req.cookies?.[SESSION_COOKIE_NAME];
    if (typeof raw === "string") await logout(raw);
    res.setHeader(
      "Set-Cookie",
      clearSessionCookie({
        secure: deps.cookieSecure,
        ...(deps.cookieDomain ? { domain: deps.cookieDomain } : {}),
      })
    );
    res.status(204).end();
  });

  if (deps.lastLinkLookup) {
    const lookup = deps.lastLinkLookup;
    r.get("/__test/last-link", (req, res) => {
      const email = typeof req.query.email === "string" ? req.query.email.trim() : "";
      if (!email) throw new AppError(400, "missing_email");
      const link = lookup(email.toLowerCase());
      if (!link) {
        res.status(404).json({ link: null });
        return;
      }
      res.json({ link });
    });
  }

  return r;
}
