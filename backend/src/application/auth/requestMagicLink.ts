import { MagicLinkModel } from "@/infrastructure/db/MagicLinkModel";
import { generateToken, hashToken } from "@/infrastructure/auth/tokens";
import type { EmailSender } from "@/infrastructure/email/EmailSender";

interface Args {
  email: string;
  sender: EmailSender;
  webBaseUrl: string;
  ttlMs: number;
}

export async function requestMagicLink(args: Args): Promise<void> {
  const email = args.email.trim().toLowerCase();
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + args.ttlMs);
  await MagicLinkModel.create({ tokenHash, email, expiresAt });
  const link = `${args.webBaseUrl}/api/auth/verify?token=${token}`;
  await args.sender.sendMagicLink({ to: email, link });
}
