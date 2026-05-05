import type { RequestHandler } from "express";
import type { Redis } from "ioredis";
import { AppError } from "./errorHandler";

export interface ClientIdRateLimitOptions {
  redis: Redis;
  windowMs: number;
  max: number;
  /** Prefix for the redis keys; namespace per route if you mount more than one. */
  keyPrefix?: string;
}

/**
 * Per-clientId sliding-window rate limit. Express-rate-limit already caps
 * by IP, but a single shared NAT can mint thousands of clientIds and
 * exhaust the worker — this caps each clientId regardless of source IP.
 *
 * Implementation: redis sorted set per clientId, scored by timestamp.
 * On each call we drop entries older than `now - windowMs`, count what
 * remains, and only insert the new one when under the cap. Single
 * pipeline; safe under concurrency because Redis runs the commands
 * sequentially per-connection.
 *
 * Mount AFTER requireClientId so req.clientId is populated.
 */
export function clientIdRateLimit(opts: ClientIdRateLimitOptions): RequestHandler {
  const prefix = opts.keyPrefix ?? "rl:client";
  return async (req, _res, next) => {
    const clientId = req.clientId;
    if (!clientId) {
      next(new AppError(400, "invalid_client_id"));
      return;
    }
    const now = Date.now();
    const cutoff = now - opts.windowMs;
    const key = `${prefix}:${clientId}`;
    try {
      const pipeline = opts.redis.multi();
      pipeline.zremrangebyscore(key, 0, cutoff);
      pipeline.zcard(key);
      const results = await pipeline.exec();
      const count = Number(results?.[1]?.[1] ?? 0);
      if (count >= opts.max) {
        next(new AppError(429, "rate_limited_per_client"));
        return;
      }
      // Allow the call. Record a fresh entry and trim TTL so the key does
      // not live forever after the client goes idle.
      const writePipe = opts.redis.multi();
      writePipe.zadd(key, now, `${now}:${Math.random()}`);
      writePipe.pexpire(key, opts.windowMs);
      await writePipe.exec();
      next();
    } catch (err) {
      // Fail open on Redis errors so a degraded queue does not 500 every
      // request. The IP-based rate limit (mounted earlier) still applies.
      next();
    }
  };
}
