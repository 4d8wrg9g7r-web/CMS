import { createHmac, timingSafeEqual } from "node:crypto";
import { giftAmountError } from "./stripe";

/**
 * Text-to-give plumbing (ADR-016): a member texts an amount to the church's
 * Twilio number, Twilio POSTs the message to our webhook, and we answer with
 * TwiML containing a prefilled Stripe Checkout link. Pure — the webhook route
 * does the I/O.
 */

export interface ParsedTextGift {
  amountCents: number;
  /** Trailing words after the amount — matched against fund names ("50 missions"). */
  fundKeyword: string | null;
}

export type TextGiftParse = { ok: true; gift: ParsedTextGift } | { ok: false; reply: string };

export const TEXT_GIVE_HELP =
  'To give, text an amount like "50" or "25.50". Add a fund name to direct your gift, like "100 Missions".';

/**
 * Parse an inbound gift text. Accepts "$50", "50", "give 50", "50 missions",
 * "GIVE $25.50 building fund". Anything unparseable (including "help") gets
 * the help reply.
 */
export function parseTextGift(body: string): TextGiftParse {
  const cleaned = body.trim().replace(/^give\b/i, "").trim();
  const match = cleaned.match(/^\$?\s*(\d+(?:\.\d{1,2})?)\b\s*(.*)$/);
  if (!match) return { ok: false, reply: TEXT_GIVE_HELP };

  const amountCents = Math.round(Number.parseFloat(match[1]!) * 100);
  const amountProblem = giftAmountError(amountCents);
  if (amountProblem) return { ok: false, reply: `${amountProblem} ${TEXT_GIVE_HELP}` };

  const keyword = match[2]?.trim().replace(/\s+/g, " ") ?? "";
  return { ok: true, gift: { amountCents, fundKeyword: keyword.length > 0 ? keyword.toLowerCase() : null } };
}

/** Pick the fund a keyword refers to; null keyword → the first fund (default). */
export function matchFundByKeyword<T extends { id: string; name: string }>(
  funds: T[],
  keyword: string | null,
): T | null {
  if (funds.length === 0) return null;
  if (!keyword) return funds[0]!;
  const normalized = keyword.toLowerCase();
  return (
    funds.find((f) => f.name.toLowerCase() === normalized) ??
    funds.find((f) => f.name.toLowerCase().startsWith(normalized)) ??
    funds.find((f) => f.name.toLowerCase().includes(normalized)) ??
    funds[0]!
  );
}

/** Last 10 digits — good enough to match US numbers across +1/formatting. */
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "").slice(-10);
}

/**
 * Verify Twilio's X-Twilio-Signature: base64(HMAC-SHA1(url + concat(sorted
 * param key+value), authToken)), constant-time compare.
 */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signatureHeader: string,
  authToken: string,
): boolean {
  if (!url || !signatureHeader || !authToken) return false;
  const data = url + Object.keys(params).sort().map((key) => key + params[key]).join("");
  const expected = createHmac("sha1", authToken).update(Buffer.from(data, "utf8")).digest("base64");
  const expectedBuf = Buffer.from(expected, "utf8");
  const candidateBuf = Buffer.from(signatureHeader.trim(), "utf8");
  return candidateBuf.length === expectedBuf.length && timingSafeEqual(candidateBuf, expectedBuf);
}

/** Escape text for a TwiML XML reply. */
export function twimlReply(message: string): string {
  const escaped = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
}
