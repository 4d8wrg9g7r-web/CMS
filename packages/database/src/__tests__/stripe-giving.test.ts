import { describe, expect, it } from "vitest";
import { TENANT_SCOPED_MODELS } from "../tenant-guard";
import {
  giftAmountError,
  MAX_GIFT_CENTS,
  MIN_GIFT_CENTS,
  signStripePayload,
  stripeFormEncode,
  verifyStripeSignature,
} from "../giving/stripe";

describe("stripeFormEncode", () => {
  it("flattens nested objects and arrays into bracket keys", () => {
    const encoded = stripeFormEncode({
      mode: "payment",
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: 2500 } }],
      metadata: { fund_id: "f_1" },
    });
    expect(encoded).toContain("mode=payment");
    expect(encoded).toContain(encodeURIComponent("line_items[0][quantity]") + "=1");
    expect(encoded).toContain(encodeURIComponent("line_items[0][price_data][currency]") + "=usd");
    expect(encoded).toContain(encodeURIComponent("line_items[0][price_data][unit_amount]") + "=2500");
    expect(encoded).toContain(encodeURIComponent("metadata[fund_id]") + "=f_1");
  });

  it("skips null and undefined values and escapes reserved characters", () => {
    const encoded = stripeFormEncode({ customer_email: "a+b@example.org", missing: null, gone: undefined });
    expect(encoded).toBe("customer_email=a%2Bb%40example.org");
  });
});

describe("verifyStripeSignature", () => {
  const secret = "whsec_test_secret_for_unit";
  const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
  const now = 1_780_000_000;

  it("accepts a correctly signed payload within tolerance", () => {
    const header = signStripePayload(payload, secret, now - 60);
    expect(verifyStripeSignature(payload, header, secret, now)).toBe(true);
  });

  it("rejects a wrong secret, tampered payload, and malformed header", () => {
    const header = signStripePayload(payload, secret, now);
    expect(verifyStripeSignature(payload, header, "whsec_other", now)).toBe(false);
    expect(verifyStripeSignature(payload + "x", header, secret, now)).toBe(false);
    expect(verifyStripeSignature(payload, "v1=deadbeef", secret, now)).toBe(false);
    expect(verifyStripeSignature(payload, "", secret, now)).toBe(false);
  });

  it("rejects stale timestamps (replay guard)", () => {
    const header = signStripePayload(payload, secret, now - 6 * 60);
    expect(verifyStripeSignature(payload, header, secret, now)).toBe(false);
  });

  it("accepts when any v1 candidate matches (key-roll grace)", () => {
    const good = signStripePayload(payload, secret, now);
    const mac = good.split("v1=")[1];
    const header = `t=${now},v1=${"0".repeat(64)},v1=${mac}`;
    expect(verifyStripeSignature(payload, header, secret, now)).toBe(true);
  });
});

describe("giftAmountError", () => {
  it("enforces integer cents within bounds", () => {
    expect(giftAmountError(2500)).toBeNull();
    expect(giftAmountError(MIN_GIFT_CENTS)).toBeNull();
    expect(giftAmountError(MAX_GIFT_CENTS)).toBeNull();
    expect(giftAmountError(MIN_GIFT_CENTS - 1)).toBeTruthy();
    expect(giftAmountError(MAX_GIFT_CENTS + 1)).toBeTruthy();
    expect(giftAmountError(25.5)).toBeTruthy();
    expect(giftAmountError("2500")).toBeTruthy();
    expect(giftAmountError(NaN)).toBeTruthy();
  });
});

describe("tenant guard registration", () => {
  it("registers OnlineGivingConfig", () => {
    expect(TENANT_SCOPED_MODELS.has("OnlineGivingConfig")).toBe(true);
  });
});
