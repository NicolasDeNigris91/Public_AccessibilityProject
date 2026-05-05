import type { Types } from "mongoose";
import { AuditModel } from "@/infrastructure/db/AuditModel";

interface Args {
  clientId: string;
  userId: Types.ObjectId;
}

/**
 * Attaches `userId` to anonymous audits that share the caller's
 * `clientId`. Skips audits already owned by some user (so a re-verify
 * from a different account does not silently steal them). Returns the
 * number of audits moved.
 */
export async function mergeAnonymousAudits(args: Args): Promise<number> {
  if (!args.clientId) return 0;
  const result = await AuditModel.updateMany(
    { clientId: args.clientId, userId: { $exists: false } },
    { $set: { userId: args.userId } }
  );
  return result.modifiedCount;
}
