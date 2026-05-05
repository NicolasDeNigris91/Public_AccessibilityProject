export interface MagicLinkMail {
  to: string;
  link: string;
}

export interface EmailSender {
  sendMagicLink(mail: MagicLinkMail): Promise<void>;
}
