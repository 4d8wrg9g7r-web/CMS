import { describe, expect, it } from "vitest";
import { ContributionMethod, OrganizationRole } from "@prisma/client";
import {
  batchTotals,
  buildAnnualStatement,
  formatCents,
  mapContributionRows,
  parseMoney,
} from "../giving/helpers";
import { can } from "../authz/giving-permissions";

describe("parseMoney / formatCents", () => {
  it("parses dollars text into integer cents", () => {
    expect(parseMoney("$1,234.56")).toBe(123456);
    expect(parseMoney("1234")).toBe(123400);
    expect(parseMoney("12.5")).toBe(1250);
    expect(parseMoney("0.05")).toBe(5);
  });
  it("rejects garbage, negatives, and sub-cent precision", () => {
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("-5")).toBeNull();
    expect(parseMoney("1.234")).toBeNull();
    expect(parseMoney("")).toBeNull();
  });
  it("formats cents back to dollars", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatCents(5)).toBe("$0.05");
    expect(formatCents(-2500)).toBe("-$25.00");
  });
});

describe("batchTotals", () => {
  const rows = [
    { amountCents: 10000, method: ContributionMethod.CHECK },
    { amountCents: 2500, method: ContributionMethod.CASH },
    { amountCents: 5000, method: ContributionMethod.CHECK },
  ];
  it("sums, groups by method, and reconciles against the expected total", () => {
    const totals = batchTotals(rows, 20000);
    expect(totals.totalCents).toBe(17500);
    expect(totals.count).toBe(3);
    expect(totals.byMethod[0]).toEqual({ method: "CHECK", count: 2, totalCents: 15000 });
    expect(totals.differenceCents).toBe(-2500);
  });
  it("reports no difference when there is no expected total", () => {
    expect(batchTotals(rows, null).differenceCents).toBeNull();
  });
});

describe("buildAnnualStatement", () => {
  const general = { name: "General", taxDeductible: true };
  const books = { name: "Bookstore", taxDeductible: false };
  const contributions = [
    { receivedAt: new Date("2025-01-05T00:00:00Z"), amountCents: 10000, method: ContributionMethod.CHECK, checkNumber: "101", fund: general },
    { receivedAt: new Date("2025-06-01T00:00:00Z"), amountCents: 2000, method: ContributionMethod.CASH, checkNumber: null, fund: books },
    { receivedAt: new Date("2025-12-28T00:00:00Z"), amountCents: 5000, method: ContributionMethod.CASH, checkNumber: null, fund: general },
    { receivedAt: new Date("2024-12-31T00:00:00Z"), amountCents: 99999, method: ContributionMethod.CHECK, checkNumber: "9", fund: general },
  ];

  it("itemizes only deductible gifts in-year, oldest first", () => {
    const s = buildAnnualStatement(contributions, 2025);
    expect(s.lines.map((l) => l.amountCents)).toEqual([10000, 5000]);
    expect(s.totalDeductibleCents).toBe(15000);
  });

  it("keeps non-deductible payments out of the tax total but visible", () => {
    const s = buildAnnualStatement(contributions, 2025);
    expect(s.nonDeductibleTotalCents).toBe(2000);
    expect(s.byFund).toEqual([{ fundName: "General", totalCents: 15000 }]);
  });

  it("excludes other years entirely", () => {
    expect(buildAnnualStatement(contributions, 2024).totalDeductibleCents).toBe(99999);
  });
});

describe("mapContributionRows (scanner/bank CSV)", () => {
  const funds = [
    { id: "f1", name: "General" },
    { id: "f2", name: "Missions" },
  ];

  it("maps scanner exports: amounts, check numbers imply CHECK, fund fallback", () => {
    const csv = [
      "Date,Amount,Check Number,Name,Email",
      "01/05/2025,$150.00,2044,Dana Whitfield,dana@example.org",
      "2025-01-05,25,,Loose plate,",
    ].join("\n");
    const { rows, errors } = mapContributionRows(csv, { funds, defaultFundId: "f1" });
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      amountCents: 15000,
      method: "CHECK",
      checkNumber: "2044",
      fundId: "f1",
      email: "dana@example.org",
    });
    expect(rows[1]).toMatchObject({ amountCents: 2500, method: "OTHER", donorName: "Loose plate" });
  });

  it("resolves funds by name and flags unknown funds per line", () => {
    const csv = ["date,amount,fund", "1/1/2025,10,Missions", "1/2/2025,10,Bake Sale"].join("\n");
    const { rows, errors } = mapContributionRows(csv, { funds, defaultFundId: "f1" });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.fundId).toBe("f2");
    expect(errors[0]!.message).toContain('Unknown fund "Bake Sale"');
  });

  it("flags bad dates, bad amounts, and unknown methods per line", () => {
    const csv = ["date,amount,method", "not-a-date,10,cash", "1/1/2025,zero,cash", "1/1/2025,10,BARTER"].join("\n");
    const { rows, errors } = mapContributionRows(csv, { funds, defaultFundId: "f1" });
    expect(rows).toHaveLength(0);
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4]);
  });

  it("requires date and amount headers", () => {
    const { errors } = mapContributionRows("name,total\nx,5", { funds, defaultFundId: "f1" });
    expect(errors[0]!.message).toContain('"date" and "amount"');
  });
});

describe("giving permissions", () => {
  it("grants OWNER/ADMIN everything", () => {
    for (const role of [OrganizationRole.OWNER, OrganizationRole.ADMIN]) {
      expect(can(role, "giving.view")).toBe(true);
      expect(can(role, "giving.record")).toBe(true);
      expect(can(role, "giving.manage_funds")).toBe(true);
      expect(can(role, "giving.statements")).toBe(true);
    }
  });
  it("denies CONTENT_MANAGER and ANALYTICS_VIEWER everything, including view", () => {
    for (const role of [OrganizationRole.CONTENT_MANAGER, OrganizationRole.ANALYTICS_VIEWER]) {
      expect(can(role, "giving.view")).toBe(false);
      expect(can(role, "giving.record")).toBe(false);
      expect(can(role, "giving.manage_funds")).toBe(false);
      expect(can(role, "giving.statements")).toBe(false);
    }
    expect(can(null, "giving.view")).toBe(false);
  });
});
