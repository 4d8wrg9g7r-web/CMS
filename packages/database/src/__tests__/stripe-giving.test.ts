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

describe("gift intervals", () => {
  it("maps every frequency onto a Stripe recurring shape", async () => {
    const { GIFT_INTERVALS, parseGiftInterval } = await import("../giving/stripe");
    expect(GIFT_INTERVALS["week"]).toEqual({ interval: "week", intervalCount: 1, label: "Weekly" });
    expect(GIFT_INTERVALS["2week"]).toEqual({ interval: "week", intervalCount: 2, label: "Every 2 weeks" });
    expect(GIFT_INTERVALS["month"]).toEqual({ interval: "month", intervalCount: 1, label: "Monthly" });
    expect(parseGiftInterval("2week")).toBe("2week");
    expect(parseGiftInterval("year")).toBeNull();
    expect(parseGiftInterval(null)).toBeNull();
  });
});

describe("fee gross-up", () => {
  it("nets the church at least the intended gift", async () => {
    const { grossUpCents, FEE_PERCENT, FEE_FIXED_CENTS } = await import("../giving/stripe");
    for (const net of [100, 2500, 5000, 10000, 123457]) {
      const gross = grossUpCents(net);
      const afterFees = gross - Math.round(gross * FEE_PERCENT) - FEE_FIXED_CENTS;
      expect(afterFees).toBeGreaterThanOrEqual(net);
      // ...and doesn't overshoot by more than a cent of rounding.
      expect(afterFees).toBeLessThanOrEqual(net + 2);
    }
  });

  it("computes the donor's fee-cover portion", async () => {
    const { feeCoverCents, grossUpCents } = await import("../giving/stripe");
    expect(feeCoverCents(5000)).toBe(grossUpCents(5000) - 5000);
    expect(feeCoverCents(5000)).toBeGreaterThan(0);
  });
});

describe("tenant guard registration (v3)", () => {
  it("registers RecurringGift", () => {
    expect(TENANT_SCOPED_MODELS.has("RecurringGift")).toBe(true);
  });
});

describe("ACH fee gross-up", () => {
  it("nets the church at least the intended gift under the capped model", async () => {
    const { grossUpCentsForMethod, ACH_FEE_PERCENT, ACH_FEE_CAP_CENTS } = await import("../giving/stripe");
    for (const net of [100, 5000, 25000, 61000, 62000, 100000, 500000]) {
      const gross = grossUpCentsForMethod(net, "bank");
      const fee = Math.min(Math.round(gross * ACH_FEE_PERCENT), ACH_FEE_CAP_CENTS);
      expect(gross - fee).toBeGreaterThanOrEqual(net);
      expect(gross - fee).toBeLessThanOrEqual(net + 2);
    }
  });

  it("caps the donor's added fee at $5 for large gifts", async () => {
    const { grossUpCentsForMethod, ACH_FEE_CAP_CENTS } = await import("../giving/stripe");
    expect(grossUpCentsForMethod(100000, "bank") - 100000).toBe(ACH_FEE_CAP_CENTS);
    expect(grossUpCentsForMethod(500000, "bank") - 500000).toBe(ACH_FEE_CAP_CENTS);
  });

  it("bank fees undercut card fees at every size", async () => {
    const { grossUpCentsForMethod } = await import("../giving/stripe");
    for (const net of [2500, 5000, 25000, 100000]) {
      expect(grossUpCentsForMethod(net, "bank")).toBeLessThan(grossUpCentsForMethod(net, "card"));
    }
  });

  it("card method delegates to the card formula", async () => {
    const { grossUpCentsForMethod, grossUpCents, parsePaymentMethod } = await import("../giving/stripe");
    expect(grossUpCentsForMethod(5000, "card")).toBe(grossUpCents(5000));
    expect(parsePaymentMethod("bank")).toBe("bank");
    expect(parsePaymentMethod("card")).toBe("card");
    expect(parsePaymentMethod(undefined)).toBe("card");
    expect(parsePaymentMethod("crypto")).toBe("card");
  });
});
