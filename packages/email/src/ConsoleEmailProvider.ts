import type { EmailProvider, SendEmailInput } from "./EmailProvider";

/**
 * Dev/no-credentials fallback (see getEmailProvider()): logs instead of sending, so
 * nothing here makes a network call. Features are built end-to-end against this stub,
 * making a real provider a contained swap rather than a rewrite.
 */
export class ConsoleEmailProvider implements EmailProvider {
  async sendEmail(input: SendEmailInput): Promise<void> {
    const attachments =
      input.attachments && input.attachments.length > 0
        ? ` attachments=[${input.attachments.map((a) => `${a.filename}(${a.content.length}b)`).join(", ")}]`
        : "";
    const html = input.html ? " html=yes" : "";
    console.log(`[email stub] to=${input.to} subject="${input.subject}"${html}${attachments}\n${input.text}`);
  }
}
