import type { RequestHandler } from "express";
import type { Redis } from "ioredis";
import { AppError } from "./errorHandler";

export interface IpEmailRateLimitOptions {
  redis: Redis;
  windowMs: number;
  max: number;
  /** Prefix for the redis keys; namespace per route if more than one. */
  keyPrefix?: string;
}

/**
 * Per-(ip, email) sliding-window rate limit for the magic-link endpoint.
 * Composite key prevents both
 *  (a) a single attacker spraying tokens to many addresses from one IP, and
 *  (b) a botnet trickling requests against one address from many IPs —
 * the latter still gets caught by the IP-level limit mounted upstream.
 *
 * Implementation mirrors clientIdRateLimit: a redis sorted set per key
 * scored by timestamp, trimmed each call. Fails open on redis errors so a
 * degraded queue does not block legitimate sign-in attempts.
 */
export function ipEmailRateLimit(opts: IpEmailRateLimitOptions): RequestHandler {
  const prefix = opts.keyPrefix ?? "rl:ip-email";
  return async (req, _res, next) => {
    const rawEmail = (req.body as { email?: unknown } | undefined)?.email;
    const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
    if (!email) {
      // No email parsed yet — let the route's own validation produce 400.
      next();
      return;
    }
    const ip = req.ip ?? "unknown";
    const now = Date.now();
    const cutoff = now - opts.windowMs;
    const key = `${prefix}:${ip}:${email}`;
    try {
      const pipeline = opts.redis.multi();
      pipeline.zremrangebyscore(key, 0, cutoff);
      pipeline.zcard(key);
      const results = await pipeline.exec();
      const count = Number(results?.[1]?.[1] ?? 0);
      if (count >= opts.max) {
        next(new AppError(429, "rate_limited_per_ip_email"));
        return;
      }
      const writePipe = opts.redis.multi();
      writePipe.zadd(key, now, `${now}:${Math.random()}`);
      writePipe.pexpire(key, opts.windowMs);
      await writePipe.exec();
      next();
    } catch {
      // Fail open. Upstream IP-level limit still applies.
      next();
    }
  };
}
