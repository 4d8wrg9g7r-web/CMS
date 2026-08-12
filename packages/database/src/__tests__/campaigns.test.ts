import { describe, expect, it } from "vitest";
import { campaignIsActive, campaignPercent, pledgeAmountError } from "../giving/campaigns";
import { TENANT_SCOPED_MODELS } from "../tenant-guard";

describe("campaignPercent", () => {
  it("clamps to 0-100 and never NaNs", () => {
    expect(campaignPercent(0, 100000)).toBe(0);
    expect(campaignPercent(50000, 100000)).toBe(50);
    expect(campaignPercent(150000, 100000)).toBe(100);
    expect(campaignPercent(333, 100000)).toBe(0);
    expect(campaignPercent(500, 100000)).toBe(1);
    expect(campaignPercent(1000, 0)).toBe(0);
    expect(campaignPercent(-5, 100)).toBe(0);
  });
});

describe("campaignIsActive", () => {
  const now = new Date("2026-08-12T12:00:00Z");
  const base = { startsAt: new Date("2026-08-01T00:00:00Z"), endsAt: null, archivedAt: null };

  it("live inside the window, dead outside it", () => {
    expect(campaignIsActive(base, now)).toBe(true);
    expect(campaignIsActive({ ...base, endsAt: new Date("2026-12-31T00:00:00Z") }, now)).toBe(true);
    expect(campaignIsActive({ ...base, startsAt: new Date("2026-09-01T00:00:00Z") }, now)).toBe(false);
    expect(campaignIsActive({ ...base, endsAt: new Date("2026-08-10T00:00:00Z") }, now)).toBe(false);
    expect(campaignIsActive({ ...base, archivedAt: new Date() }, now)).toBe(false);
  });
});

describe("pledgeAmountError", () => {
  it("bounds pledges", () => {
    expect(pledgeAmountError(500000)).toBeNull();
    expect(pledgeAmountError(100)).toBeNull();
    expect(pledgeAmountError(99)).toBeTruthy();
    expect(pledgeAmountError(100_000_001)).toBeTruthy();
    expect(pledgeAmountError("5000")).toBeTruthy();
    expect(pledgeAmountError(50.5)).toBeTruthy();
  });
});

describe("tenant guard registration", () => {
  it("registers Campaign and Pledge", () => {
    expect(TENANT_SCOPED_MODELS.has("Campaign")).toBe(true);
    expect(TENANT_SCOPED_MODELS.has("Pledge")).toBe(true);
  });
});
