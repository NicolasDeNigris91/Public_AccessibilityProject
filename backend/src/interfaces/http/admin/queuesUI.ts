import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import type { Express } from "express";
import { auditQueue, auditDeadQueue } from "@/infrastructure/queue/auditQueue";
import { basicAuth } from "../middlewares/basicAuth";

const ADMIN_PATH = "/admin/queues";

export interface MountQueuesUIOptions {
  user: string | undefined;
  pass: string | undefined;
}

/**
 * Mount the Bull-Board UI at /admin/queues, protected by basic auth.
 * Returns true when the route is mounted (both creds present), false
 * when intentionally skipped (so a misconfigured prod cannot serve
 * the admin UI without authentication).
 *
 * The board exposes both the live `audits` queue and the `audits-dead`
 * dead-letter queue so an operator can replay or discard failed jobs
 * from a single place.
 */
export function mountQueuesUI(app: Express, opts: MountQueuesUIOptions): boolean {
  if (!opts.user || !opts.pass) return false;

  const adapter = new ExpressAdapter();
  adapter.setBasePath(ADMIN_PATH);
  createBullBoard({
    queues: [new BullMQAdapter(auditQueue), new BullMQAdapter(auditDeadQueue)],
    serverAdapter: adapter,
  });

  app.use(ADMIN_PATH, basicAuth({ user: opts.user, pass: opts.pass, realm: "Bull-Board" }));
  app.use(ADMIN_PATH, adapter.getRouter());
  return true;
}
