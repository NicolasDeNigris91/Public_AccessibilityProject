import { ErrorRequestHandler } from "express";
import { logger } from "@/config/logger";

// Stable `code` for clients to branch on, optional human `message`,
// and an optional `hint` for operator-facing detail (e.g.
// "Set EMAIL_PROVIDER=resend …" on a 503 from the auth route).
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly hint?: string;
  constructor(status: number, code: string, opts?: { message?: string; hint?: string }) {
    super(opts?.message ?? code);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    if (opts?.hint !== undefined) this.hint = opts.hint;
  }
}

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    hint?: string;
  };
  requestId: string;
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = (req as { requestId?: string }).requestId ?? "unknown";
  if (err instanceof AppError) {
    const body: ErrorEnvelope = {
      error: { code: err.code, message: err.message, ...(err.hint ? { hint: err.hint } : {}) },
      requestId,
    };
    res.status(err.status).json(body);
    return;
  }
  logger.error({ err, requestId }, "unhandled error");
  const body: ErrorEnvelope = {
    error: { code: "internal_server_error", message: "Internal server error" },
    requestId,
  };
  res.status(500).json(body);
};
