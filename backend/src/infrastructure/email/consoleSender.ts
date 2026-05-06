import type { Logger } from "pino";
import type { EmailSender, MagicLinkMail } from "./EmailSender";

/**
 * Dev-only sender. In test we silence the log so unit-test output stays
 * clean; in dev the pino-info line is the developer's "inbox".
 */
export class ConsoleSender implements EmailSender {
  constructor(private readonly logger: Logger) {}

  async sendMagicLink(mail: MagicLinkMail): Promise<void> {
    if (process.env.NODE_ENV === "test") return;
    this.logger.info({ to: mail.to, link: mail.link }, "magic link issued (console sender)");
  }
}
