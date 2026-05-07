import type { RequestHandler } from "express";
import type { Redis } from "ioredis";
import { AppError } from "./errorHandler";

export interface IpRateLimitOptions {
  redis: Redis;
  windowMs: number;
  max: number;
  /** Prefix for the redis keys; namespace per route if more than one. */
  keyPrefix?: string;
}

/**
 * Per-IP sliding-window rate limit for routes whose body has no stable
 * second key (e.g. GET /verify, where the only tunable is a token in the
 * URL — keying by token would let an attacker rotate tokens to escape).
 *
 * Implementation mirrors ipEmailRateLimit: a redis sorted set per key
 * scored by timestamp, trimmed each call. Fails open on redis errors so a
 * degraded queue does not block legitimate traffic.
 */
export function ipRateLimit(opts: IpRateLimitOptions): RequestHandler {
  const prefix = opts.keyPrefix ?? "rl:ip";
  return async (req, _res, next) => {
    const ip = req.ip ?? "unknown";
    const now = Date.now();
    const cutoff = now - opts.windowMs;
    const key = `${prefix}:${ip}`;
    try {
      const pipeline = opts.redis.multi();
      pipeline.zremrangebyscore(key, 0, cutoff);
      pipeline.zcard(key);
      const results = await pipeline.exec();
      const count = Number(results?.[1]?.[1] ?? 0);
      if (count >= opts.max) {
        next(new AppError(429, "rate_limited_per_ip"));
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
