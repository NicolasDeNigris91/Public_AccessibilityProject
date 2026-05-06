import type { Types } from "mongoose";
import { AuditModel } from "@/infrastructure/db/AuditModel";
import { logger } from "@/config/logger";
import {
  authAnonymousAuditsMergeTotal,
  authAnonymousAuditsMovedTotal,
} from "@/infrastructure/metrics/registry";

interface Args {
  clientId: string;
  userId: Types.ObjectId;
}

type Outcome = "merged" | "no_match" | "skipped";

function emit(args: Args, modifiedCount: number, outcome: Outcome): void {
  authAnonymousAuditsMergeTotal.inc({ outcome });
  if (modifiedCount > 0) {
    authAnonymousAuditsMovedTotal.inc(modifiedCount);
  }
  logger.info(
    {
      event: "auth.merge_anonymous_audits",
      userId: args.userId.toString(),
      clientId: args.clientId,
      modifiedCount,
      outcome,
    },
    "merge_anonymous_audits"
  );
}

/**
 * Attaches `userId` to anonymous audits that share the caller's
 * `clientId`. Skips audits already owned by some user (so a re-verify
 * from a different account does not silently steal them). Returns the
 * number of audits moved.
 */
export async function mergeAnonymousAudits(args: Args): Promise<number> {
  if (!args.clientId) {
    emit(args, 0, "skipped");
    return 0;
  }
  const result = await AuditModel.updateMany(
    { clientId: args.clientId, userId: { $exists: false } },
    { $set: { userId: args.userId } }
  );
  const modifiedCount = result.modifiedCount;
  emit(args, modifiedCount, modifiedCount > 0 ? "merged" : "no_match");
  return modifiedCount;
}
