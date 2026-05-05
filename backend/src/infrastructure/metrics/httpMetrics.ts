import type { RequestHandler, Request } from "express";
import { httpRequestDuration } from "./registry";

/**
 * Bucket the response status into a class label so the histogram doesn't
 * explode into a separate series per status code.
 */
function statusClass(status: number): string {
  if (status >= 500) return "5xx";
  if (status >= 400) return "4xx";
  if (status >= 300) return "3xx";
  if (status >= 200) return "2xx";
  return "1xx";
}

/**
 * Prefer Express's matched route (e.g. "/api/audits/:publicId") over the
 * raw request URL. Falls back to the path when no route matched (404 etc),
 * but only the first two segments — keeps cardinality bounded for hostile
 * traffic that probes deep paths.
 */
function routeLabel(req: Request): string {
  const matched = req.route?.path;
  if (matched) {
    const base = (req.baseUrl || "").replace(/\/$/, "");
    return `${base}${matched}` || "/";
  }
  const segments = req.path.split("/").filter(Boolean).slice(0, 2);
  return "/" + segments.join("/");
}

export const httpMetricsMiddleware: RequestHandler = (req, res, next) => {
  const stop = httpRequestDuration.startTimer();
  res.once("finish", () => {
    stop({
      route: routeLabel(req),
      method: req.method,
      status_class: statusClass(res.statusCode),
    });
  });
  next();
};
