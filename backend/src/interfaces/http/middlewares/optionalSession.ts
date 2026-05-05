import type { RequestHandler } from "express";
import { getSession } from "@/application/auth/getSession";
import { SESSION_COOKIE_NAME } from "@/infrastructure/auth/cookies";

declare module "express-serve-static-core" {
  interface Request {
    userId?: string;
    userEmail?: string;
  }
}

export const optionalSession: RequestHandler = async (req, _res, next) => {
  try {
    const raw = req.cookies?.[SESSION_COOKIE_NAME];
    const session = await getSession(typeof raw === "string" ? raw : undefined);
    if (session) {
      req.userId = session.userId;
      req.userEmail = session.email;
    }
    next();
  } catch (err) {
    next(err);
  }
};
