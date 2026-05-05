import { Router, type RequestHandler } from "express";
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
   * normal runs; tests can pass a stub. When absent the route is unbounded
   * apart from the upstream IP-level limit.
   */
  magicLinkRateLimiter?: RequestHandler;
}

const passThrough: RequestHandler = (_req, _res, next) => next();

const EmailBody = z.object({ email: z.string().email().max(254) });

export function buildAuthRouter(deps: AuthRouterDeps): Router {
  const r = Router();

  r.post("/magic-link", deps.magicLinkRateLimiter ?? passThrough, async (req, res) => {
    if (!deps.sender) {
      throw new AppError(503, "auth/email-not-configured", {
        hint: "Set EMAIL_PROVIDER=resend plus RESEND_API_KEY and EMAIL_FROM in this environment.",
      });
    }
    const parsed = EmailBody.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, "invalid_email");
    await requestMagicLink({
      email: parsed.data.email,
      sender: deps.sender,
      webBaseUrl: deps.webBaseUrl,
      ttlMs: deps.magicLinkTtlMs,
    });
    res.status(202).end();
  });

  r.get("/verify", async (req, res) => {
    const rawToken = typeof req.query.token === "string" ? req.query.token : "";
    if (!rawToken) throw new AppError(400, "missing_token");
    let out;
    try {
      out = await verifyMagicLink({ rawToken, sessionTtlMs: deps.sessionTtlMs });
    } catch (err) {
      if (err instanceof VerifyError) throw new AppError(401, err.code);
      throw err;
    }

    const clientId = req.header("X-Client-Id");
    if (clientId) {
      await mergeAnonymousAudits({
        clientId,
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
