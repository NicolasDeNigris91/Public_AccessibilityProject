import type { RequestHandler } from "express";
import { z } from "zod";
import { AppError } from "./errorHandler";

declare module "express-serve-static-core" {
  interface Request {
    clientId?: string;
  }
}

const ClientIdSchema = z.string().uuid();

export const requireClientId: RequestHandler = (req, _res, next) => {
  const raw = req.header("X-Client-Id");
  const parsed = ClientIdSchema.safeParse(raw);
  if (!parsed.success) throw new AppError(400, "invalid_client_id");
  req.clientId = parsed.data;
  next();
};
