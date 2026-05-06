import type { Resend } from "resend";
import type { EmailSender, MagicLinkMail } from "./EmailSender";

export class ResendSender implements EmailSender {
  constructor(
    readonly client: Pick<Resend, "emails">,
    readonly from: string
  ) {}

  async sendMagicLink(mail: MagicLinkMail): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.from,
      to: [mail.to],
      subject: "Seu acesso ao Euthus",
      html: htmlBody(mail.link),
    });
    if (error) throw new Error(`resend: ${error.message ?? "unknown error"}`);
  }
}

function htmlBody(link: string): string {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif">
    <h1 style="font-weight:400">Acessar o Euthus</h1>
    <p>Clique no link abaixo para entrar. Ele expira em 15 minutos.</p>
    <p><a href="${link}" style="color:#B8532A">Entrar agora</a></p>
    <p style="color:#6B6358;font-size:12px">Se você não solicitou esse acesso, ignore este e-mail.</p>
  </body></html>`;
}
