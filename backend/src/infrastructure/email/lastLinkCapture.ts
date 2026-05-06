import type { EmailSender, MagicLinkMail } from "./EmailSender";

/**
 * Wraps an EmailSender to remember the most recent magic-link URL per
 * email address (lowercased). Server.ts installs this wrapper outside
 * production so the `__test/last-link` route can complete the e2e flow
 * without a real inbox. Never wired in prod — the capture map and the
 * route both stay absent, so no link history is retained.
 */
export class LastLinkCapture implements EmailSender {
  private readonly latest = new Map<string, string>();

  constructor(private readonly inner: EmailSender) {}

  async sendMagicLink(mail: MagicLinkMail): Promise<void> {
    this.latest.set(mail.to.trim().toLowerCase(), mail.link);
    await this.inner.sendMagicLink(mail);
  }

  lookup(email: string): string | undefined {
    return this.latest.get(email.trim().toLowerCase());
  }
}
