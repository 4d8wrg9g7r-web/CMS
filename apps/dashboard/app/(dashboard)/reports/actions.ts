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
import { askReportAssistant } from "../../../lib/ai/report-assistant";
import { campusService, eventService, givingService } from "@cms/database";

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

export interface AskAiResult {
  ok: boolean;
  error?: string;
  config?: ReportConfig;
  explanation?: string;
}

/**
 * Closed AI reporting: only the QUESTION plus schema vocabulary (source/dimension
 * lists, fund/campus/event names, custom-field labels) is sent to Claude — never
 * records, amounts, or aggregates. The returned config is validated and permission-
 * checked exactly like a hand-built one, and the query itself runs locally.
 */
export async function askReportAiAction(input: { question: string; currentConfig?: unknown }): Promise<AskAiResult> {
  try {
    const organization = await requireOrg();
    const question = input.question.trim();
    if (!question) return { ok: false, error: "Ask a question first." };
    if (question.length > 500) return { ok: false, error: "Keep the question under 500 characters." };

    const [peopleOk, attendanceOk, givingOk] = await Promise.all([
      canPeople(organization.id, "person.view"),
      canCheckin(organization.id, "attendance.view"),
      canGiving(organization.id, "giving.view"),
    ]);
    const allowedSources = [
      ...(peopleOk ? ["people"] : []),
      ...(attendanceOk ? ["attendance"] : []),
      ...(givingOk ? ["giving"] : []),
    ];
    if (allowedSources.length === 0) return { ok: false, error: "You don't have access to any report sources." };

    const [campuses, funds, events, fieldDefs] = await Promise.all([
      campusService.listCampuses(organization.id),
      givingOk ? givingService.listFunds(organization.id, { includeArchived: true }) : Promise.resolve([]),
      attendanceOk ? eventService.listEvents(organization.id) : Promise.resolve([]),
      peopleOk ? peopleService.listFieldDefinitions(organization.id) : Promise.resolve([]),
    ]);

    const answer = await askReportAssistant({
      question,
      currentConfig: input.currentConfig,
      metadata: {
        allowedSources,
        campuses: campuses.map((c) => ({ id: c.id, name: c.name })),
        funds: funds.map((f) => ({ id: f.id, name: f.name, taxDeductible: f.taxDeductible })),
        events: events.map((e) => ({ id: e.id, name: e.title })),
        customFields: fieldDefs.map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options })),
      },
    });

    // Same gate as every other config — the model's output is untrusted input.
    const validated = validateReportConfig(answer.config, fieldDefs.map((d) => d.key));
    if (!validated.ok) {
      return { ok: false, error: `The assistant proposed an invalid report (${validated.errors[0]}). Try rephrasing.` };
    }
    const denied = await checkReportPermissions(organization.id, validated.config);
    if (denied) return { ok: false, error: denied };

    return { ok: true, config: validated.config, explanation: answer.explanation };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "The assistant is unavailable right now" };
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
