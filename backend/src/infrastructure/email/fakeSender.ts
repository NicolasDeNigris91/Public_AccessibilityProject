import type { EmailSender, MagicLinkMail } from "./EmailSender";

/** Test-only sender. Stores every send for assertion. */
export class FakeSender implements EmailSender {
  inbox: MagicLinkMail[] = [];

  async sendMagicLink(mail: MagicLinkMail): Promise<void> {
    this.inbox.push(mail);
  }

  clearInbox(): void {
    this.inbox = [];
  }
}
