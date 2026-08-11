"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  auditService,
  givingService,
  onlineGivingService,
  mapContributionRows,
  parseMoney,
  MAX_IMPORT_BYTES,
  type ContributionMethod,
  type ImportRowError,
} from "@cms/database";
import { getCurrentOrganization, getCurrentUser } from "../../../lib/session";
import { requireGiving } from "../../../lib/giving-access";

async function requireOrg() {
  const organization = await getCurrentOrganization();
  if (!organization) throw new Error("No organization");
  return organization;
}

const str = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

export async function createFundAction(formData: FormData) {
  const organization = await requireOrg();
  await requireGiving(organization.id, "giving.manage_funds");

  const name = str(formData, "name");
  const fund = await givingService.createFund(organization.id, {
    name,
    description: str(formData, "description") || null,
    taxDeductible: formData.get("taxDeductible") === "on",
  });

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "giving.fund_created",
    targetType: "Fund",
    targetId: fund.id,
    metadata: { name, taxDeductible: fund.taxDeductible },
  });
  revalidatePath("/giving/funds");
  revalidatePath("/giving");
}

export async function setFundArchivedAction(fundId: string, archived: boolean) {
  const organization = await requireOrg();
  await requireGiving(organization.id, "giving.manage_funds");
  await givingService.setFundArchived(organization.id, fundId, archived);

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: archived ? "giving.fund_archived" : "giving.fund_restored",
    targetType: "Fund",
    targetId: fundId,
  });
  revalidatePath("/giving/funds");
}

export async function createBatchAction(formData: FormData) {
  const organization = await requireOrg();
  await requireGiving(organization.id, "giving.record");

  const name = str(formData, "name");
  const dateRaw = str(formData, "batchDate");
  const batchDate = dateRaw ? new Date(`${dateRaw}T00:00:00Z`) : new Date();
  const expectedRaw = str(formData, "expected");
  let expectedCents: number | null = null;
  if (expectedRaw) {
    expectedCents = parseMoney(expectedRaw);
    if (expectedCents === null) throw new Error("Expected total must be an amount like 1234.56");
  }

  const actor = await getCurrentUser();
  const batch = await givingService.createBatch(organization.id, {
    name,
    batchDate,
    expectedCents,
    createdByUserId: actor?.id ?? null,
  });

  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "giving.batch_created",
    targetType: "ContributionBatch",
    targetId: batch.id,
    metadata: { name },
  });
  redirect(`/giving/batches/${batch.id}`);
}

export async function setBatchClosedAction(batchId: string, close: boolean) {
  const organization = await requireOrg();
  await requireGiving(organization.id, "giving.record");
  const changed = close
    ? await givingService.closeBatch(organization.id, batchId)
    : await givingService.reopenBatch(organization.id, batchId);
  if (!changed) throw new Error("Batch not found or already in that state.");

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: close ? "giving.batch_closed" : "giving.batch_reopened",
    targetType: "ContributionBatch",
    targetId: batchId,
  });
  revalidatePath(`/giving/batches/${batchId}`);
  revalidatePath("/giving");
}

export async function recordContributionAction(batchId: string | null, formData: FormData) {
  const organization = await requireOrg();
  await requireGiving(organization.id, "giving.record");

  const amountCents = parseMoney(str(formData, "amount"));
  if (amountCents === null || amountCents === 0) throw new Error("Enter an amount like 25 or 1,250.50.");
  const dateRaw = str(formData, "receivedAt");

  const actor = await getCurrentUser();
  const contribution = await givingService.recordContribution(organization.id, {
    personId: str(formData, "personId") || null,
    donorName: str(formData, "donorName") || null,
    fundId: str(formData, "fundId"),
    batchId,
    amountCents,
    method: (str(formData, "method") || "CASH") as ContributionMethod,
    checkNumber: str(formData, "checkNumber") || null,
    receivedAt: dateRaw ? new Date(`${dateRaw}T00:00:00Z`) : new Date(),
    note: str(formData, "note") || null,
    createdByUserId: actor?.id ?? null,
  });

  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "giving.contribution_recorded",
    targetType: "Contribution",
    targetId: contribution.id,
    metadata: { amountCents, method: contribution.method, fundId: contribution.fundId, batchId },
  });
  if (batchId) revalidatePath(`/giving/batches/${batchId}`);
  revalidatePath("/giving");
}

export async function deleteContributionAction(batchId: string, contributionId: string) {
  const organization = await requireOrg();
  await requireGiving(organization.id, "giving.record");
  const deleted = await givingService.deleteContribution(organization.id, contributionId);
  if (!deleted) throw new Error("Entry not found.");

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "giving.contribution_deleted",
    targetType: "Contribution",
    targetId: contributionId,
    metadata: { batchId },
  });
  revalidatePath(`/giving/batches/${batchId}`);
  revalidatePath("/giving");
}

export interface GivingImportState {
  summary: { createdCount: number; matchedCount: number; unmatchedCount: number; errorCount: number; errors: ImportRowError[] } | null;
  error: string | null;
}

/** Scanner/bank CSV import into an open batch (docs/domain/giving.md). */
export async function importContributionsAction(
  batchId: string,
  _prev: GivingImportState,
  formData: FormData,
): Promise<GivingImportState> {
  try {
    const organization = await requireOrg();
    await requireGiving(organization.id, "giving.record");

    const file = formData.get("file");
    let csvText = String(formData.get("csv") ?? "").trim();
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_IMPORT_BYTES) throw new Error("That file is larger than 1 MB.");
      csvText = await file.text();
    }
    if (!csvText) throw new Error("Choose a CSV file or paste CSV text.");

    const defaultFundId = String(formData.get("defaultFundId") ?? "");
    const funds = await givingService.listFunds(organization.id);
    if (!funds.some((f) => f.id === defaultFundId)) throw new Error("Choose the fund for rows without a fund column.");

    const { rows, errors } = mapContributionRows(csvText, {
      funds: funds.map((f) => ({ id: f.id, name: f.name })),
      defaultFundId,
    });

    const actor = await getCurrentUser();
    const result = await givingService.importContributions(organization.id, {
      rows,
      parseErrors: errors,
      batchId,
      createdByUserId: actor?.id ?? null,
    });

    await auditService.recordAuditEvent({
      organizationId: organization.id,
      actorUserId: actor?.id,
      action: "giving.contributions_imported",
      targetType: "ContributionBatch",
      targetId: batchId,
      metadata: {
        createdCount: result.createdCount,
        matchedCount: result.matchedCount,
        unmatchedCount: result.unmatchedCount,
        errorCount: result.errorCount,
      },
    });

    revalidatePath(`/giving/batches/${batchId}`);
    revalidatePath("/giving");
    return { summary: result, error: null };
  } catch (err) {
    return { summary: null, error: err instanceof Error ? err.message : "Import failed" };
  }
}

/* ---------------------------------------------------------------- *
 * Online giving (docs/domain/giving.md "Online giving", ADR-015).
 * Keys are write-only from the UI; empty fields keep the stored key.
 * ---------------------------------------------------------------- */

export async function saveOnlineGivingConfigAction(
  _prev: { error: string | null; saved: boolean },
  formData: FormData,
): Promise<{ error: string | null; saved: boolean }> {
  try {
    const organization = await requireOrg();
    await requireGiving(organization.id, "giving.manage_funds");

    await onlineGivingService.saveConfig(organization.id, {
      enabled: formData.get("enabled") === "on",
      achEnabled: formData.get("achEnabled") === "on",
      textGivingEnabled: formData.get("textGivingEnabled") === "on",
      currency: str(formData, "currency") || "usd",
      stripeSecretKey: str(formData, "stripeSecretKey") || null,
      stripeWebhookSecret: str(formData, "stripeWebhookSecret") || null,
      twilioAuthToken: str(formData, "twilioAuthToken") || null,
    });

    const actor = await getCurrentUser();
    await auditService.recordAuditEvent({
      organizationId: organization.id,
      actorUserId: actor?.id,
      action: "giving.online_config_updated",
      targetType: "Organization",
      targetId: organization.id,
      // Never the keys themselves — only which fields changed.
      metadata: {
        enabled: formData.get("enabled") === "on",
        keyUpdated: Boolean(str(formData, "stripeSecretKey")),
        webhookSecretUpdated: Boolean(str(formData, "stripeWebhookSecret")),
      },
    });

    revalidatePath("/giving/online");
    return { error: null, saved: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save", saved: false };
  }
}

export async function setFundOnlineAction(fundId: string, online: boolean) {
  const organization = await requireOrg();
  await requireGiving(organization.id, "giving.manage_funds");

  await onlineGivingService.setFundOnline(organization.id, fundId, online);

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: online ? "giving.fund_online_enabled" : "giving.fund_online_disabled",
    targetType: "Fund",
    targetId: fundId,
  });
  revalidatePath("/giving/online");
}
