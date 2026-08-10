import { ContributionMethod } from "@prisma/client";
import { parseCsv, type ImportRowError } from "../people/import";

/**
 * Pure Giving helpers (docs/domain/giving.md). Money is ALWAYS integer cents in
 * this codebase — these are the only places dollars-text is converted, and no
 * float ever holds a monetary value.
 */

/** "$1,234.56" | "1234.5" | "1234" → cents, or null when unparseable/negative. */
export function parseMoney(input: string): number | null {
  const v = input.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  const [whole, frac = ""] = v.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, "0")}`;
}

export interface BatchTotals {
  count: number;
  totalCents: number;
  byMethod: { method: ContributionMethod; count: number; totalCents: number }[];
  /** null when the batch has no expected total to reconcile against. */
  differenceCents: number | null;
}

/** Reconciliation summary for a counting batch. */
export function batchTotals(
  rows: { amountCents: number; method: ContributionMethod }[],
  expectedCents: number | null,
): BatchTotals {
  const byMethod = new Map<ContributionMethod, { count: number; totalCents: number }>();
  let totalCents = 0;
  for (const row of rows) {
    totalCents += row.amountCents;
    const entry = byMethod.get(row.method) ?? { count: 0, totalCents: 0 };
    entry.count++;
    entry.totalCents += row.amountCents;
    byMethod.set(row.method, entry);
  }
  return {
    count: rows.length,
    totalCents,
    byMethod: [...byMethod.entries()]
      .map(([method, v]) => ({ method, ...v }))
      .sort((a, b) => b.totalCents - a.totalCents),
    differenceCents: expectedCents === null ? null : totalCents - expectedCents,
  };
}

export interface StatementLine {
  receivedAt: Date;
  fundName: string;
  method: ContributionMethod;
  checkNumber: string | null;
  amountCents: number;
}

export interface AnnualStatement {
  year: number;
  /** Itemized, deductible gifts only, oldest first. */
  lines: StatementLine[];
  totalDeductibleCents: number;
  byFund: { fundName: string; totalCents: number }[];
  /** Non-deductible payments (books, trips) — summarized, never on the tax total. */
  nonDeductibleTotalCents: number;
}

/**
 * Year-end giving statement (IRS-style): itemizes tax-deductible gifts and keeps
 * non-deductible payments strictly out of the deductible total, surfacing them only
 * as an informational figure.
 */
export function buildAnnualStatement(
  contributions: {
    receivedAt: Date;
    amountCents: number;
    method: ContributionMethod;
    checkNumber: string | null;
    fund: { name: string; taxDeductible: boolean };
  }[],
  year: number,
): AnnualStatement {
  const inYear = contributions.filter((c) => c.receivedAt.getUTCFullYear() === year);
  const deductible = inYear.filter((c) => c.fund.taxDeductible);
  const byFund = new Map<string, number>();
  for (const c of deductible) {
    byFund.set(c.fund.name, (byFund.get(c.fund.name) ?? 0) + c.amountCents);
  }
  return {
    year,
    lines: deductible
      .map((c) => ({
        receivedAt: c.receivedAt,
        fundName: c.fund.name,
        method: c.method,
        checkNumber: c.checkNumber,
        amountCents: c.amountCents,
      }))
      .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime()),
    totalDeductibleCents: deductible.reduce((sum, c) => sum + c.amountCents, 0),
    byFund: [...byFund.entries()]
      .map(([fundName, totalCents]) => ({ fundName, totalCents }))
      .sort((a, b) => b.totalCents - a.totalCents),
    nonDeductibleTotalCents: inYear
      .filter((c) => !c.fund.taxDeductible)
      .reduce((sum, c) => sum + c.amountCents, 0),
  };
}

/** A validated contribution import row, ready for the service. */
export interface ContributionImportRow {
  line: number;
  receivedAt: Date;
  amountCents: number;
  method: ContributionMethod;
  checkNumber: string | null;
  fundId: string;
  email: string | null;
  donorName: string | null;
  note: string | null;
}

const METHOD_BY_NAME = new Map(Object.values(ContributionMethod).map((m) => [m.toLowerCase(), m]));

function parseDateCell(raw: string): Date | null {
  const v = raw.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(v);
  let y = 0;
  let m = 0;
  let d = 0;
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (us) {
    [m, d, y] = [Number(us[1]), Number(us[2]), Number(us[3])];
    if (y < 100) y += y >= 30 ? 1900 : 2000;
  } else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

/**
 * Maps a check-scanner / bank export CSV to contribution rows. Recognized headers
 * (case-insensitive, any order): date, amount, fund, method, checkNumber, email,
 * name, note. Only date and amount are required per row; a missing fund column (or
 * blank cell) falls back to `defaultFundId`; a row with a check number and no
 * method is a CHECK. Unknown funds and bad amounts/dates are per-line errors.
 */
export function mapContributionRows(
  csvText: string,
  opts: { funds: { id: string; name: string }[]; defaultFundId: string },
): { rows: ContributionImportRow[]; errors: ImportRowError[] } {
  const records = parseCsv(csvText);
  const rows: ContributionImportRow[] = [];
  const errors: ImportRowError[] = [];
  if (records.length < 2) {
    return { rows, errors: [{ line: 1, message: "The CSV needs a header row and at least one data row." }] };
  }

  const header = records[0]!.map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
  const col = (...names: string[]) => {
    for (const name of names) {
      const idx = header.indexOf(name);
      if (idx !== -1) return idx;
    }
    return -1;
  };
  const idx = {
    date: col("date", "receivedat", "giftdate", "depositdate"),
    amount: col("amount", "giftamount", "total"),
    fund: col("fund", "fundname", "designation", "account"),
    method: col("method", "paymenttype", "type"),
    checkNumber: col("checknumber", "checkno", "check", "chequenumber"),
    email: col("email", "emailaddress", "donoremail"),
    name: col("name", "donorname", "donor", "fullname"),
    note: col("note", "notes", "memo"),
  };
  if (idx.date === -1 || idx.amount === -1) {
    return { rows, errors: [{ line: 1, message: 'The header row must include "date" and "amount" columns.' }] };
  }

  const fundByName = new Map(opts.funds.map((f) => [f.name.trim().toLowerCase(), f.id]));
  const get = (record: string[], index: number) => (index === -1 ? "" : (record[index] ?? "").trim());

  for (let r = 1; r < records.length; r++) {
    const record = records[r]!;
    const line = r + 1;

    const receivedAt = parseDateCell(get(record, idx.date));
    if (!receivedAt) {
      errors.push({ line, message: `"${get(record, idx.date)}" is not a date (use YYYY-MM-DD or MM/DD/YYYY).` });
      continue;
    }
    const amountCents = parseMoney(get(record, idx.amount));
    if (amountCents === null || amountCents === 0) {
      errors.push({ line, message: `"${get(record, idx.amount)}" is not a valid amount.` });
      continue;
    }

    const rawFund = get(record, idx.fund);
    let fundId = opts.defaultFundId;
    if (rawFund) {
      const matched = fundByName.get(rawFund.toLowerCase());
      if (!matched) {
        errors.push({ line, message: `Unknown fund "${rawFund}" — create it in Giving → Funds first.` });
        continue;
      }
      fundId = matched;
    }

    const checkNumber = get(record, idx.checkNumber) || null;
    const rawMethod = get(record, idx.method);
    let method = rawMethod ? METHOD_BY_NAME.get(rawMethod.toLowerCase()) : undefined;
    if (rawMethod && !method) {
      errors.push({ line, message: `Unknown method "${rawMethod}" (expected CASH, CHECK, CARD, ACH, or OTHER).` });
      continue;
    }
    if (!method) method = checkNumber ? ContributionMethod.CHECK : ContributionMethod.OTHER;

    rows.push({
      line,
      receivedAt,
      amountCents,
      method,
      checkNumber,
      fundId,
      email: get(record, idx.email) || null,
      donorName: get(record, idx.name) || null,
      note: get(record, idx.note) || null,
    });
  }

  return { rows, errors };
}
