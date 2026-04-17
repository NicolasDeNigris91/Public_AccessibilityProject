import { ErrorRequestHandler } from "express";
import { logger } from "@/config/logger";

/**
 * Errors thrown in routes or middlewares. Carry a stable machine code (for the
 * API consumer to branch on) and an optional human-readable message. When the
 * message is not provided, the code doubles as the message, which is fine for
 * short codes like "not_found".
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
  };
  requestId: string;
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = (req as { requestId?: string }).requestId ?? "unknown";
  if (err instanceof AppError) {
    const body: ErrorEnvelope = {
      error: { code: err.code, message: err.message },
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
