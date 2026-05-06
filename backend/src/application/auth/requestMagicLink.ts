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
}

export async function requestMagicLink(args: Args): Promise<void> {
  const email = args.email.trim().toLowerCase();
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + args.ttlMs);
  await MagicLinkModel.create({
    tokenHash,
    email,
    expiresAt,
    ...(args.clientId ? { clientId: args.clientId } : {}),
  });
  const link = `${args.webBaseUrl}/api/auth/verify?token=${token}`;
  await args.sender.sendMagicLink({ to: email, link });
}
