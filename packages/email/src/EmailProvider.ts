/**
 * The email seam (mirrors packages/ai/src/AIProvider.ts's role for the AI seam).
 * ConsoleEmailProvider is the only implementation today -- see getEmailProvider() in
 * index.ts -- but every call site goes through this interface so a real provider
 * (Resend, Postmark, SES, SMTP) can be swapped in later without touching callers.
 */
export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
}

export interface EmailProvider {
  sendEmail(input: SendEmailInput): Promise<void>;
}
