import type { RequestHandler } from "express";
import { AppError } from "./errorHandler";

export const requireSession: RequestHandler = (req, _res, next) => {
  if (!req.userId) {
    next(new AppError(401, "unauthorized"));
    return;
  }
  next();
};
