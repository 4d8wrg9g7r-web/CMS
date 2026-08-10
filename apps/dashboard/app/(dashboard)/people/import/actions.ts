"use server";

import { revalidatePath } from "next/cache";
import {
  applyMappingPlan,
  auditService,
  campusService,
  mapImportRows,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  parseCsv,
  peopleService,
  validateMappingPlan,
  type ImportRowError,
  type MappingPlan,
} from "@cms/database";
import { getCurrentOrganization, getCurrentUser } from "../../../../lib/session";
import { requirePeople } from "../../../../lib/people-access";
import { AI_IMPORT_MODEL, proposeMappingPlan } from "../../../../lib/ai/import-mapper";

export interface ImportState {
  summary: {
    createdCount: number;
    skippedCount: number;
    errorCount: number;
    errors: ImportRowError[];
  } | null;
  error: string | null;
}

export interface AnalyzeState {
  analysis: {
    plan: MappingPlan;
    /** Round-tripped through a hidden field; re-validated server-side on confirm. */
    planJson: string;
    csvText: string;
    fileName: string | null;
    /** Canonical header + first mapped rows for the review table. */
    preview: string[][];
    previewErrors: ImportRowError[];
    validCount: number;
    errorCount: number;
  } | null;
  error: string | null;
}

/** Pulls CSV text out of the shared file/paste inputs, enforcing the size caps. */
async function readCsv(formData: FormData): Promise<{ csvText: string; fileName: string | null }> {
  const file = formData.get("file");
  const pasted = String(formData.get("csv") ?? "");
  let csvText = pasted.trim();
  let fileName: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_IMPORT_BYTES) {
      throw new Error("That file is larger than 1 MB — split it and import in parts.");
    }
    csvText = await file.text();
    fileName = file.name;
  }
  if (!csvText) throw new Error("Choose a CSV file or paste CSV text.");
  if (csvText.length > MAX_IMPORT_BYTES) {
    throw new Error("That CSV is larger than 1 MB — split it and import in parts.");
  }
  return { csvText, fileName };
}

/**
 * CSV people import (docs/domain/people-import.md). person.import enforced
 * server-side; the raw file is parsed in-request and never stored. Returns the
 * summary for one-time in-memory display via useActionState.
 */
export async function importPeopleAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  try {
    const organization = await getCurrentOrganization();
    if (!organization) throw new Error("No organization");
    await requirePeople(organization.id, "person.import");

    const { csvText, fileName } = await readCsv(formData);
    const records = parseCsv(csvText);
    if (records.length - 1 > MAX_IMPORT_ROWS) {
      throw new Error(`Imports are capped at ${MAX_IMPORT_ROWS.toLocaleString()} rows per run — split the file.`);
    }

    const campuses = await campusService.listCampuses(organization.id);
    const { rows, errors } = mapImportRows(records, campuses);

    const actor = await getCurrentUser();
    const result = await peopleService.importPeople(organization.id, {
      rows,
      parseErrors: errors,
      totalRows: Math.max(0, records.length - 1),
      fileName,
      createdByUserId: actor?.id ?? null,
    });

    await auditService.recordAuditEvent({
      organizationId: organization.id,
      actorUserId: actor?.id,
      action: "people.imported",
      targetType: "PersonImport",
      targetId: result.importId,
      metadata: {
        fileName,
        createdCount: result.createdCount,
        skippedCount: result.skippedCount,
        errorCount: result.errorCount,
      },
    });

    revalidatePath("/people");
    revalidatePath("/people/import");
    return {
      summary: {
        createdCount: result.createdCount,
        skippedCount: result.skippedCount,
        errorCount: result.errorCount,
        errors: result.errors,
      },
      error: null,
    };
  } catch (err) {
    return { summary: null, error: err instanceof Error ? err.message : "Import failed" };
  }
}

/**
 * Step 1 of the AI-assisted flow (ADR-011): ask Claude for a mapping plan from masked
 * column profiles, then dry-run it locally so the user reviews the plan AND the real
 * mapped outcome before anything is written. No database writes happen here.
 */
export async function analyzeImportAction(_prev: AnalyzeState, formData: FormData): Promise<AnalyzeState> {
  try {
    const organization = await getCurrentOrganization();
    if (!organization) throw new Error("No organization");
    await requirePeople(organization.id, "person.import");

    const { csvText, fileName } = await readCsv(formData);
    const records = parseCsv(csvText);
    if (records.length < 2) throw new Error("The CSV needs a header row and at least one data row.");
    if (records.length - 1 > MAX_IMPORT_ROWS) {
      throw new Error(`Imports are capped at ${MAX_IMPORT_ROWS.toLocaleString()} rows per run — split the file.`);
    }

    const campuses = await campusService.listCampuses(organization.id);
    const plan = await proposeMappingPlan({ records, campusNames: campuses.map((c) => c.name) });

    // Deterministic dry run: exactly what the confirm step will do, minus the writes.
    const mappedRecords = applyMappingPlan(records, plan);
    const { rows, errors } = mapImportRows(mappedRecords, campuses);

    return {
      analysis: {
        plan,
        planJson: JSON.stringify(plan),
        csvText,
        fileName,
        preview: mappedRecords.slice(0, 9),
        previewErrors: errors.slice(0, 10),
        validCount: rows.length,
        errorCount: errors.length,
      },
      error: null,
    };
  } catch (err) {
    return { analysis: null, error: err instanceof Error ? err.message : "Analysis failed" };
  }
}

/**
 * Step 2: the user approved the reviewed plan. The plan JSON round-trips through the
 * client, so it is re-validated against the file's real headers before use — the
 * import itself is the same deterministic pipeline as the exact-header path.
 */
export async function importWithPlanAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  try {
    const organization = await getCurrentOrganization();
    if (!organization) throw new Error("No organization");
    await requirePeople(organization.id, "person.import");

    const csvText = String(formData.get("csvText") ?? "");
    const fileName = String(formData.get("fileName") ?? "") || null;
    if (!csvText || csvText.length > MAX_IMPORT_BYTES) throw new Error("The CSV is missing or too large — start over.");
    const records = parseCsv(csvText);
    if (records.length - 1 > MAX_IMPORT_ROWS) {
      throw new Error(`Imports are capped at ${MAX_IMPORT_ROWS.toLocaleString()} rows per run — split the file.`);
    }

    let rawPlan: unknown;
    try {
      rawPlan = JSON.parse(String(formData.get("plan") ?? ""));
    } catch {
      throw new Error("The mapping plan is malformed — run the analysis again.");
    }
    const validated = validateMappingPlan(rawPlan, records[0] ?? []);
    if (!validated.ok) throw new Error(`The mapping plan is no longer valid (${validated.errors[0]}).`);

    const campuses = await campusService.listCampuses(organization.id);
    const { rows, errors } = mapImportRows(applyMappingPlan(records, validated.plan), campuses);

    const actor = await getCurrentUser();
    const result = await peopleService.importPeople(organization.id, {
      rows,
      parseErrors: errors,
      totalRows: Math.max(0, records.length - 1),
      fileName,
      createdByUserId: actor?.id ?? null,
    });

    // ADR-007: AI-assisted mutations record model + plan provenance in the audit log.
    await auditService.recordAuditEvent({
      organizationId: organization.id,
      actorUserId: actor?.id,
      action: "people.imported",
      targetType: "PersonImport",
      targetId: result.importId,
      metadata: {
        fileName,
        createdCount: result.createdCount,
        skippedCount: result.skippedCount,
        errorCount: result.errorCount,
        aiAssisted: true,
        aiModel: AI_IMPORT_MODEL,
        aiPlanSummary: validated.plan.summary,
      },
    });

    revalidatePath("/people");
    revalidatePath("/people/import");
    return {
      summary: {
        createdCount: result.createdCount,
        skippedCount: result.skippedCount,
        errorCount: result.errorCount,
        errors: result.errors,
      },
      error: null,
    };
  } catch (err) {
    return { summary: null, error: err instanceof Error ? err.message : "Import failed" };
  }
}
