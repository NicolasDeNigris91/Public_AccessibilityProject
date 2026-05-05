import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { dispatchWebVital } from "@/application/rumDispatch";

/**
 * Real User Monitoring beacon endpoint. The frontend ships a single
 * vital per request via `navigator.sendBeacon`, which is fire-and-forget
 * — we ack with 204 so a slow response can never delay the page.
 *
 * No X-Client-Id required: web vitals from anonymous browsers are
 * exactly the dataset we want. The IP-level rate limit applied at the
 * server level still bounds abusive senders. Validation is strict:
 * unknown metric names, unknown routes, and out-of-range values are
 * rejected at the dispatcher and counted in `web_vital_rejected_total`.
 */
const Beacon = z.object({
  name: z.string().min(1).max(16),
  value: z.number(),
  route: z.string().min(1).max(64),
});

// RUM gets its own per-IP rate limit because the global cap (30/min)
// is sized for state-changing API calls; web-vitals fires 5 metrics per
// page load and a busy reader navigating ~6 pages in a minute would
// trip the global cap on beacons alone. Beacons are tiny and don't
// touch the database, so a higher per-IP cap is safe. Returns 204 on
// throttle as well, matching the rest of the endpoint's quiet failure
// mode (sendBeacon should never surface a 4xx in devtools).
const rumRateLimit = rateLimit({
  windowMs: 60_000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(204).end();
  },
});

export const rumRouter = Router();
rumRouter.use(rumRateLimit);

/**
 * @openapi
 * /api/rum:
 *   post:
 *     summary: Real User Monitoring beacon (Core Web Vitals)
 *     description: |
 *       Single-vital beacon emitted by the frontend `web-vitals` library.
 *       The body is intentionally tiny so it fits in a `sendBeacon` call.
 *       Always returns 204 No Content; the metric is incremented only
 *       when the payload validates against the documented contract.
 *     tags: [System]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, value, route]
 *             properties:
 *               name:
 *                 type: string
 *                 enum: [LCP, INP, FCP, TTFB, CLS]
 *               value:
 *                 type: number
 *                 description: For LCP/INP/FCP/TTFB this is milliseconds; CLS is unitless.
 *               route:
 *                 type: string
 *                 description: Page route key — see backend/src/application/rumDispatch.ts for the allowlist.
 *     responses:
 *       204:
 *         description: Beacon accepted (or quietly rejected).
 */
rumRouter.post("/", (req, res) => {
  const parsed = Beacon.safeParse(req.body);
  if (!parsed.success) {
    // Don't 4xx a beacon: that would surface in the browser console
    // and panic users. Track invalid shape via the rejected counter
    // (see dispatchWebVital).
    res.status(204).end();
    return;
  }
  dispatchWebVital(parsed.data);
  res.status(204).end();
});
