import { MagicLinkModel } from "@/infrastructure/db/MagicLinkModel";
import { UserModel } from "@/infrastructure/db/UserModel";
import { SessionModel } from "@/infrastructure/db/SessionModel";
import { hashToken, generateToken } from "@/infrastructure/auth/tokens";

export class VerifyError extends Error {
  constructor(public readonly code: "invalid_token" | "expired" | "already_used") {
    super(code);
  }
}

interface Args {
  rawToken: string;
  sessionTtlMs: number;
}

interface Out {
  userId: string;
  rawSessionToken: string;
  email: string;
  /**
   * `clientId` captured at request time (POST /magic-link), if any. The
   * router uses it to call `mergeAnonymousAudits` without depending on a
   * `X-Client-Id` header on the email-link click, which browsers do not
   * propagate on plain navigation.
   */
  clientId?: string;
}

/**
 * Marks the link used atomically (`findOneAndUpdate` with the
 * `usedAt: null` predicate) so two concurrent verifications cannot
 * both succeed. Then upserts the User and creates a Session.
 */
export async function verifyMagicLink(args: Args): Promise<Out> {
  const tokenHash = hashToken(args.rawToken);
  const link = await MagicLinkModel.findOne({ tokenHash });
  if (!link) throw new VerifyError("invalid_token");
  if (link.usedAt) throw new VerifyError("already_used");
  if (link.expiresAt.getTime() < Date.now()) throw new VerifyError("expired");

  const claimed = await MagicLinkModel.findOneAndUpdate(
    { tokenHash, usedAt: null },
    { $set: { usedAt: new Date() } },
    { new: true }
  );
  if (!claimed) throw new VerifyError("already_used");

  const user = await UserModel.findOneAndUpdate(
    { email: link.email },
    { $setOnInsert: { email: link.email } },
    { upsert: true, new: true }
  );

  const rawSessionToken = generateToken();
  await SessionModel.create({
    tokenHash: hashToken(rawSessionToken),
    userId: user._id,
    expiresAt: new Date(Date.now() + args.sessionTtlMs),
  });

  return {
    userId: (user._id as { toString(): string }).toString(),
    rawSessionToken,
    email: link.email,
    ...(link.clientId ? { clientId: link.clientId } : {}),
  };
}
