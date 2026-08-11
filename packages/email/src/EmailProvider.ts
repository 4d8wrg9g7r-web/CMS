/**
 * The email seam (mirrors packages/ai/src/AIProvider.ts's role for the AI seam).
 * Every call site goes through this interface so providers (Resend today; Postmark,
 * SES, SMTP later) can be swapped without touching callers. `html` and `attachments`
 * are optional so plain transactional callers stay unchanged; when `html` is set,
 * `text` remains the plain-text alternative part.
 */
export interface EmailAttachmentInput {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachmentInput[];
}

export interface EmailProvider {
  sendEmail(input: SendEmailInput): Promise<void>;
}
