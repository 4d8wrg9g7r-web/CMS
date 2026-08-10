export type { EmailProvider, SendEmailInput } from "./EmailProvider";
export { ConsoleEmailProvider } from "./ConsoleEmailProvider";
export { ResendEmailProvider } from "./ResendEmailProvider";

import type { EmailProvider } from "./EmailProvider";
import { ConsoleEmailProvider } from "./ConsoleEmailProvider";
import { ResendEmailProvider } from "./ResendEmailProvider";

let cachedProvider: EmailProvider | null = null;

/**
 * Same real-vs-mock branch as getAIProvider()/getResourceProvider(): a real
 * RESEND_API_KEY switches to ResendEmailProvider (sending from RESEND_EMAIL_DOMAIN,
 * which must already be verified with Resend); otherwise falls back to
 * ConsoleEmailProvider for local dev / any environment without those set.
 */
export function getEmailProvider(): EmailProvider {
  if (cachedProvider) return cachedProvider;
  const apiKey = process.env.RESEND_API_KEY;
  const domain = process.env.RESEND_EMAIL_DOMAIN;
  cachedProvider = apiKey && domain ? new ResendEmailProvider(apiKey, domain) : new ConsoleEmailProvider();
  return cachedProvider;
}
