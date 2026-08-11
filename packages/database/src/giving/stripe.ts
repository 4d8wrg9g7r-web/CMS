import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Pure Stripe plumbing for online giving (ADR-015): no Stripe SDK — the API
 * is plain form-encoded HTTPS and webhook signatures are documented HMAC, so
 * we hand-roll both (same call as the S3 SigV4 provider, ADR on file). Keep
 * this module free of I/O so every branch is unit-testable.
 */

/**
 * Stripe's bracket form encoding: nested objects/arrays flatten to
 * line_items[0][price_data][currency]=usd. Skips null/undefined.
 */
export function stripeFormEncode(params: Record<string, unknown>): string {
  const pairs: string[] = [];
  const walk = (key: string, value: unknown) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(`${key}[${i}]`, item));
    } else if (typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) walk(`${key}[${k}]`, v);
    } else {
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  };
  for (const [k, v] of Object.entries(params)) walk(k, v);
  return pairs.join("&");
}

export const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

/**
 * Verify a `Stripe-Signature` header (t=<unix>,v1=<hmac>,...) against the raw
 * request body. HMAC-SHA256 of `${t}.${payload}` with the endpoint's signing
 * secret; constant-time compare; timestamps older than the tolerance are
 * rejected to stop replays. `nowSeconds` is injectable for tests.
 */
export function verifyStripeSignature(
  payload: string,
  signatureHeader: string,
  signingSecret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!payload || !signatureHeader || !signingSecret) return false;

  let timestamp: string | null = null;
  const candidates: string[] = [];
  for (const part of signatureHeader.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key?.trim() === "t" && value) timestamp = value.trim();
    if (key?.trim() === "v1" && value) candidates.push(value.trim());
  }
  if (!timestamp || candidates.length === 0) return false;

  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > STRIPE_SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", signingSecret).update(`${timestamp}.${payload}`).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  return candidates.some((candidate) => {
    const candidateBuf = Buffer.from(candidate, "utf8");
    return candidateBuf.length === expectedBuf.length && timingSafeEqual(candidateBuf, expectedBuf);
  });
}

/** Sign a payload the way Stripe does — used by tests and local smokes only. */
export function signStripePayload(payload: string, signingSecret: string, timestampSeconds: number): string {
  const mac = createHmac("sha256", signingSecret).update(`${timestampSeconds}.${payload}`).digest("hex");
  return `t=${timestampSeconds},v1=${mac}`;
}

export const MIN_GIFT_CENTS = 100; // $1 — Stripe's own practical minimum region
export const MAX_GIFT_CENTS = 5_000_000; // $50,000 — fat-finger guard, not a policy

/** Validate a gift amount in cents; returns an error message or null. */
export function giftAmountError(amountCents: unknown): string | null {
  if (typeof amountCents !== "number" || !Number.isInteger(amountCents)) return "Enter a valid amount.";
  if (amountCents < MIN_GIFT_CENTS) return "The minimum online gift is $1.";
  if (amountCents > MAX_GIFT_CENTS) return "That amount is above the online limit — contact your church office.";
  return null;
}
