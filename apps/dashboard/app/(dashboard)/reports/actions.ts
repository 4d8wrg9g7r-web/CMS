"use server";

import { revalidatePath } from "next/cache";
import {
  aggregateReport,
  auditService,
  peopleService,
  reportingService,
  reportUsesPersonData,
  validateReportConfig,
  type ReportConfig,
  type ReportGroup,
  type ReportMeasure,
} from "@cms/database";
import { getCurrentOrganization, getCurrentUser } from "../../../lib/session";
import { canPeople } from "../../../lib/people-access";
import { canCheckin } from "../../../lib/checkin-access";
import { canGiving } from "../../../lib/giving-access";

/**
 * Report actions (docs/domain/reports.md). Configs arrive from the client (or from
 * a SavedReport row) as untrusted JSON: validateReportConfig is the single gate,
 * and permissions are enforced per run — the source's own permission PLUS
 * person.view whenever the config reaches into person fields (BLUEPRINT §61:
 * aggregates over restricted fields still leak them). Only aggregates ever leave
 * the server; row-level data stays in the service layer.
 */

async function requireOrg() {
  const organization = await getCurrentOrganization();
  if (!organization) throw new Error("No organization");
  return organization;
}

async function checkReportPermissions(organizationId: string, config: ReportConfig): Promise<string | null> {
  const sourceAllowed =
    config.source === "people"
      ? await canPeople(organizationId, "person.view")
      : config.source === "attendance"
        ? await canCheckin(organizationId, "attendance.view")
        : await canGiving(organizationId, "giving.view");
  if (!sourceAllowed) return `You don't have access to ${config.source} reports.`;
  if (reportUsesPersonData(config) && !(await canPeople(organizationId, "person.view"))) {
    return "Grouping or filtering by people fields requires People access.";
  }
  return null;
}

export interface RunReportResult {
  ok: boolean;
  error?: string;
  groups?: ReportGroup[];
  total?: number;
  rowCount?: number;
  truncated?: boolean;
  measure?: ReportMeasure;
}

export async function runReportAction(input: { config: unknown }): Promise<RunReportResult> {
  try {
    const organization = await requireOrg();
    const fieldDefs = await peopleService.listFieldDefinitions(organization.id);
    const validated = validateReportConfig(input.config, fieldDefs.map((d) => d.key));
    if (!validated.ok) return { ok: false, error: validated.errors[0] };

    const denied = await checkReportPermissions(organization.id, validated.config);
    if (denied) return { ok: false, error: denied };

    const { rows, truncated } = await reportingService.fetchReportRows(organization.id, validated.config);
    const result = aggregateReport(rows, validated.config);
    return {
      ok: true,
      groups: result.groups,
      total: result.total,
      rowCount: result.rowCount,
      truncated,
      measure: result.measure,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not run the report" };
  }
}

export async function saveReportAction(input: { name: string; config: unknown }): Promise<{ ok: boolean; error?: string }> {
  try {
    const organization = await requireOrg();
    const fieldDefs = await peopleService.listFieldDefinitions(organization.id);
    const validated = validateReportConfig(input.config, fieldDefs.map((d) => d.key));
    if (!validated.ok) return { ok: false, error: validated.errors[0] };
    const denied = await checkReportPermissions(organization.id, validated.config);
    if (denied) return { ok: false, error: denied };

    const actor = await getCurrentUser();
    const saved = await reportingService.saveReport(organization.id, {
      name: input.name,
      config: validated.config,
      createdByUserId: actor?.id ?? null,
    });
    await auditService.recordAuditEvent({
      organizationId: organization.id,
      actorUserId: actor?.id,
      action: "report.saved",
      targetType: "SavedReport",
      targetId: saved.id,
      metadata: { name: saved.name, source: validated.config.source },
    });
    revalidatePath("/reports");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save the report" };
  }
}

export async function deleteSavedReportAction(reportId: string): Promise<void> {
  const organization = await requireOrg();
  // Deleting a shortcut is harmless; creating/running is what's permission-gated.
  // Still scoped to the org and audited.
  const deleted = await reportingService.deleteSavedReport(organization.id, reportId);
  if (!deleted) return;
  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "report.deleted",
    targetType: "SavedReport",
    targetId: reportId,
  });
  revalidatePath("/reports");
}
