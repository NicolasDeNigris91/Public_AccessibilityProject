import { MagicLinkModel } from "@/infrastructure/db/MagicLinkModel";
import { generateToken, hashToken } from "@/infrastructure/auth/tokens";
import type { EmailSender } from "@/infrastructure/email/EmailSender";

interface Args {
  email: string;
  sender: EmailSender;
  webBaseUrl: string;
  ttlMs: number;
  /**
   * Captured at request time (from `X-Client-Id` on POST /magic-link). Stored
   * on the MagicLink so /verify can merge anonymous audits even when the
   * email-link click does not propagate the header.
   */
  clientId?: string;
  /**
   * Captured at request time (from the `Idempotency-Key` header). When
   * present, a prior MagicLink with the same (email, idempotencyKey)
   * inside its TTL window short-circuits the call: no new link, no new
   * email. The original send stands. This neutralises double-form-submit
   * and naive client retries without burning rate-limit budget.
   */
  idempotencyKey?: string;
}

export async function requestMagicLink(args: Args): Promise<void> {
  const email = args.email.trim().toLowerCase();
  if (args.idempotencyKey) {
    const existing = await MagicLinkModel.findOne({
      email,
      idempotencyKey: args.idempotencyKey,
      expiresAt: { $gt: new Date() },
    });
    if (existing) return;
  }
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + args.ttlMs);
  await MagicLinkModel.create({
    tokenHash,
    email,
    expiresAt,
    ...(args.clientId ? { clientId: args.clientId } : {}),
    ...(args.idempotencyKey ? { idempotencyKey: args.idempotencyKey } : {}),
  });
  const link = `${args.webBaseUrl}/api/auth/verify?token=${token}`;
  await args.sender.sendMagicLink({ to: email, link });
}
