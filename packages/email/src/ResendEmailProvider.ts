import { Resend } from "resend";
import type { EmailProvider, SendEmailInput } from "./EmailProvider";

/**
 * Real email delivery, used whenever RESEND_API_KEY is set (see getEmailProvider()
 * in index.ts). The sending domain must already be verified with Resend -- see
 * RESEND_EMAIL_DOMAIN, the domain this sends "from".
 */
export class ResendEmailProvider implements EmailProvider {
  private readonly client: Resend;
  private readonly fromAddress: string;

  constructor(apiKey: string, domain: string) {
    this.client = new Resend(apiKey);
    this.fromAddress = `CMS <noreply@${domain}>`;
  }

  async sendEmail(input: SendEmailInput): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.fromAddress,
      to: input.to,
      subject: input.subject,
      text: input.text,
      ...(input.html ? { html: input.html } : {}),
      ...(input.attachments && input.attachments.length > 0
        ? {
            attachments: input.attachments.map((a) => ({
              filename: a.filename,
              content: a.content,
              ...(a.contentType ? { contentType: a.contentType } : {}),
            })),
          }
        : {}),
    });
    if (error) {
      throw new Error(`Resend failed to send email to ${input.to}: ${error.message}`);
    }
  }
}
