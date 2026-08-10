import { BatchStatus, ContributionMethod, Prisma } from "@prisma/client";
import { tenantDb } from "../client";
import { batchTotals, buildAnnualStatement, type ContributionImportRow } from "../giving/helpers";
import type { ImportRowError } from "../people/import";

/**
 * Giving service (docs/domain/giving.md) — contribution RECORDING only. Every query
 * is organizationId-scoped; money is integer cents throughout; funds and batches
 * archive/close rather than delete so the financial trail is never destroyed.
 * Deliberately no processor calls here (ADR-006): online giving arrives as a later,
 * tokenized integration and will write the same Contribution rows.
 */

// -- Funds ---------------------------------------------------------------------

export async function listFunds(organizationId: string, opts: { includeArchived?: boolean } = {}) {
  return tenantDb.fund.findMany({
    where: { organizationId, ...(opts.includeArchived ? {} : { archivedAt: null }) },
    orderBy: { createdAt: "asc" },
  });
}

export async function createFund(
  organizationId: string,
  input: { name: string; description?: string | null; taxDeductible: boolean },
) {
  const name = input.name.trim();
  if (!name) throw new Error("Fund name is required.");
  const existing = await tenantDb.fund.findFirst({
    where: { organizationId, name: { equals: name, mode: "insensitive" } },
  });
  if (existing) {
    if (!existing.archivedAt) throw new Error(`A fund named "${name}" already exists.`);
    return tenantDb.fund.update({ where: { id: existing.id }, data: { archivedAt: null } });
  }
  return tenantDb.fund.create({
    data: { organizationId, name, description: input.description?.trim() || null, taxDeductible: input.taxDeductible },
  });
}

/**
 * Rename/describe only — taxDeductible is deliberately immutable after creation:
 * flipping it would silently rewrite the tax character of every past gift. Archive
 * the fund and create a new one instead.
 */
export async function updateFund(
  organizationId: string,
  fundId: string,
  input: { name?: string; description?: string | null },
) {
  const data: Prisma.FundUpdateManyMutationInput = {};
  if (input.name !== undefined && input.name.trim()) data.name = input.name.trim();
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  const result = await tenantDb.fund.updateMany({ where: { id: fundId, organizationId }, data });
  return result.count > 0;
}

export async function setFundArchived(organizationId: string, fundId: string, archived: boolean) {
  const result = await tenantDb.fund.updateMany({
    where: { id: fundId, organizationId },
    data: { archivedAt: archived ? new Date() : null },
  });
  return result.count > 0;
}

// -- Batches -------------------------------------------------------------------

export async function listBatches(organizationId: string, take = 30) {
  const batches = await tenantDb.contributionBatch.findMany({
    where: { organizationId },
    orderBy: [{ batchDate: "desc" }, { createdAt: "desc" }],
    take,
    include: { _count: { select: { contributions: true } } },
  });
  const sums = await tenantDb.contribution.groupBy({
    by: ["batchId"],
    where: { organizationId, batchId: { in: batches.map((b) => b.id) } },
    _sum: { amountCents: true },
  });
  const sumByBatch = new Map(sums.map((s) => [s.batchId, s._sum.amountCents ?? 0]));
  return batches.map((b) => ({ ...b, totalCents: sumByBatch.get(b.id) ?? 0 }));
}

export async function getBatch(organizationId: string, batchId: string) {
  const batch = await tenantDb.contributionBatch.findFirst({
    where: { id: batchId, organizationId },
    include: {
      contributions: {
        include: { person: true, fund: { select: { id: true, name: true, taxDeductible: true } } },
        orderBy: { createdAt: "asc" },
      },
      createdBy: { select: { name: true, email: true } },
    },
  });
  if (!batch) return null;
  return {
    ...batch,
    totals: batchTotals(batch.contributions, batch.expectedCents),
  };
}

export async function createBatch(
  organizationId: string,
  input: { name: string; batchDate: Date; expectedCents?: number | null; createdByUserId?: string | null },
) {
  if (!input.name.trim()) throw new Error("Batch name is required.");
  return tenantDb.contributionBatch.create({
    data: {
      organizationId,
      name: input.name.trim(),
      batchDate: input.batchDate,
      expectedCents: input.expectedCents ?? null,
      createdByUserId: input.createdByUserId ?? null,
    },
  });
}

/** Closing freezes the batch: recordContribution refuses rows into a CLOSED batch. */
export async function closeBatch(organizationId: string, batchId: string) {
  const result = await tenantDb.contributionBatch.updateMany({
    where: { id: batchId, organizationId, status: BatchStatus.OPEN },
    data: { status: BatchStatus.CLOSED, closedAt: new Date() },
  });
  return result.count > 0;
}

export async function reopenBatch(organizationId: string, batchId: string) {
  const result = await tenantDb.contributionBatch.updateMany({
    where: { id: batchId, organizationId, status: BatchStatus.CLOSED },
    data: { status: BatchStatus.OPEN, closedAt: null },
  });
  return result.count > 0;
}

// -- Contributions -------------------------------------------------------------

export interface ContributionInput {
  personId?: string | null;
  donorName?: string | null;
  fundId: string;
  batchId?: string | null;
  amountCents: number;
  method: ContributionMethod;
  checkNumber?: string | null;
  receivedAt: Date;
  note?: string | null;
  createdByUserId?: string | null;
}

export async function recordContribution(organizationId: string, input: ContributionInput) {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("Amount must be a positive number.");
  }
  const fund = await tenantDb.fund.findFirst({ where: { id: input.fundId, organizationId, archivedAt: null } });
  if (!fund) throw new Error("Fund not found.");
  if (input.batchId) {
    const batch = await tenantDb.contributionBatch.findFirst({
      where: { id: input.batchId, organizationId },
      select: { status: true },
    });
    if (!batch) throw new Error("Batch not found.");
    if (batch.status === BatchStatus.CLOSED) throw new Error("This batch is closed — reopen it to add entries.");
  }
  if (input.personId) {
    const person = await tenantDb.person.findFirst({
      where: { id: input.personId, organizationId },
      select: { id: true },
    });
    if (!person) throw new Error("Person not found.");
  }
  return tenantDb.contribution.create({
    data: {
      organizationId,
      personId: input.personId ?? null,
      donorName: input.donorName?.trim() || null,
      fundId: input.fundId,
      batchId: input.batchId ?? null,
      amountCents: input.amountCents,
      method: input.method,
      checkNumber: input.checkNumber?.trim() || null,
      receivedAt: input.receivedAt,
      note: input.note?.trim() || null,
      createdByUserId: input.createdByUserId ?? null,
    },
  });
}

export async function deleteContribution(organizationId: string, contributionId: string) {
  // Entry errors happen during counting; a hard delete is allowed only while the
  // batch (if any) is still open. Closed-batch rows are immutable history.
  const row = await tenantDb.contribution.findFirst({
    where: { id: contributionId, organizationId },
    include: { batch: { select: { status: true } } },
  });
  if (!row) return false;
  if (row.batch && row.batch.status === BatchStatus.CLOSED) {
    throw new Error("This entry belongs to a closed batch and cannot be deleted.");
  }
  await tenantDb.contribution.deleteMany({ where: { id: contributionId, organizationId } });
  return true;
}

/**
 * Bulk-record scanner/bank CSV rows (mapContributionRows output). Donors are matched
 * to People by email (case-insensitive); unmatched rows keep donorName so nothing is
 * lost. All rows land in the given batch.
 */
export async function importContributions(
  organizationId: string,
  input: {
    rows: ContributionImportRow[];
    parseErrors: ImportRowError[];
    batchId: string;
    createdByUserId?: string | null;
  },
) {
  const emails = [...new Set(input.rows.map((r) => r.email).filter((e): e is string => !!e))];
  const people = emails.length
    ? await tenantDb.person.findMany({
        where: { organizationId, archivedAt: null, email: { in: emails, mode: "insensitive" } },
        select: { id: true, email: true },
      })
    : [];
  const personByEmail = new Map(people.map((p) => [p.email!.toLowerCase(), p.id]));

  let matchedCount = 0;
  for (const row of input.rows) {
    const personId = row.email ? (personByEmail.get(row.email.toLowerCase()) ?? null) : null;
    if (personId) matchedCount++;
    await recordContribution(organizationId, {
      personId,
      donorName: personId ? null : row.donorName,
      fundId: row.fundId,
      batchId: input.batchId,
      amountCents: row.amountCents,
      method: row.method,
      checkNumber: row.checkNumber,
      receivedAt: row.receivedAt,
      note: row.note,
      createdByUserId: input.createdByUserId ?? null,
    });
  }
  return {
    createdCount: input.rows.length,
    matchedCount,
    unmatchedCount: input.rows.length - matchedCount,
    errorCount: input.parseErrors.length,
    errors: input.parseErrors.slice(0, 100),
  };
}

// -- Reporting -----------------------------------------------------------------

export async function fundSummaries(organizationId: string, from: Date, to: Date) {
  const grouped = await tenantDb.contribution.groupBy({
    by: ["fundId"],
    where: { organizationId, receivedAt: { gte: from, lte: to } },
    _sum: { amountCents: true },
    _count: true,
  });
  const funds = await tenantDb.fund.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } });
  return funds
    .map((fund) => {
      const g = grouped.find((x) => x.fundId === fund.id);
      return {
        fund,
        totalCents: g?._sum.amountCents ?? 0,
        count: g?._count ?? 0,
      };
    })
    .filter((f) => f.count > 0 || !f.fund.archivedAt);
}

export async function listContributionsForPerson(organizationId: string, personId: string, take = 20) {
  return tenantDb.contribution.findMany({
    where: { organizationId, personId },
    include: { fund: { select: { name: true, taxDeductible: true } } },
    orderBy: { receivedAt: "desc" },
    take,
  });
}

/** Year-end statement for one person — deductible funds only on the tax total. */
export async function annualStatement(organizationId: string, personId: string, year: number) {
  const contributions = await tenantDb.contribution.findMany({
    where: {
      organizationId,
      personId,
      receivedAt: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) },
    },
    include: { fund: { select: { name: true, taxDeductible: true } } },
  });
  return buildAnnualStatement(contributions, year);
}
