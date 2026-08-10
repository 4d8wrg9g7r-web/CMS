"use server";

import { revalidatePath } from "next/cache";
import {
  applyMappingPlan,
  auditService,
  buildWizardColumns,
  campusService,
  detectTagDelimiter,
  guessMappingColumns,
  mapImportRows,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  parseCsv,
  peopleService,
  validateMappingPlan,
  type ImportRowError,
  type MappingColumn,
  type MappingPlan,
  type WizardColumn,
} from "@cms/database";
import { getCurrentOrganization, getCurrentUser } from "../../../../lib/session";
import { requirePeople } from "../../../../lib/people-access";
import { AI_IMPORT_MODEL, aiImportAvailable, proposeMappingPlan } from "../../../../lib/ai/import-mapper";

/**
 * Server half of the import wizard (docs/domain/people-import.md, ADR-011).
 * The client walks the user through one question per screen; every payload it
 * sends back (CSV text + assembled plan) is re-validated here before use, and
 * only runImportAction writes anything. AI is strictly opt-in: startImportWizardAction
 * and every other action here are AI-free — Claude is only ever called from
 * aiProposalAction, which the client invokes solely after the user chooses
 * "Use AI suggestions" on the consent screen.
 */

export interface WizardStartData {
  csvText: string;
  fileName: string | null;
  rowCount: number;
  columns: WizardColumn[];
  /** Local heuristic pre-fills (alias matching) — no AI involved. */
  guesses: MappingColumn[];
  /** Likeliest tag separator per column, aligned with `columns`. */
  delimiters: (";" | "," | "|")[];
  aiAvailable: boolean;
}

export interface WizardStartState {
  data: WizardStartData | null;
  error: string | null;
}

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

function parseWithCaps(csvText: string): string[][] {
  const records = parseCsv(csvText);
  if (records.length < 2) throw new Error("The CSV needs a header row and at least one data row.");
  if (records.length - 1 > MAX_IMPORT_ROWS) {
    throw new Error(`Imports are capped at ${MAX_IMPORT_ROWS.toLocaleString()} rows per run — split the file.`);
  }
  return records;
}

/** Step 1: parse the upload and hand the client everything the questions need. No AI. */
export async function startImportWizardAction(_prev: WizardStartState, formData: FormData): Promise<WizardStartState> {
  try {
    const organization = await getCurrentOrganization();
    if (!organization) throw new Error("No organization");
    await requirePeople(organization.id, "person.import");

    const { csvText, fileName } = await readCsv(formData);
    const records = parseWithCaps(csvText);
    const columns = buildWizardColumns(records);

    return {
      data: {
        csvText,
        fileName,
        rowCount: records.length - 1,
        columns,
        guesses: guessMappingColumns(records[0] ?? []),
        delimiters: columns.map((c) => detectTagDelimiter(c.values)),
        aiAvailable: aiImportAvailable(),
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "Could not read that file" };
  }
}

export interface AiProposalResult {
  ok: boolean;
  plan?: MappingPlan;
  error?: string;
}

/**
 * Called ONLY after the user explicitly chooses AI help on the consent screen.
 * Sends masked column profiles (never rows) to Claude; failures degrade to the
 * heuristic pre-fills the client already has.
 */
export async function aiProposalAction(input: { csvText: string }): Promise<AiProposalResult> {
  try {
    const organization = await getCurrentOrganization();
    if (!organization) throw new Error("No organization");
    await requirePeople(organization.id, "person.import");

    const records = parseWithCaps(input.csvText);
    const campuses = await campusService.listCampuses(organization.id);
    const plan = await proposeMappingPlan({ records, campusNames: campuses.map((c) => c.name) });
    return { ok: true, plan };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "AI analysis failed" };
  }
}

export interface DryRunResult {
  ok: boolean;
  error?: string;
  preview?: string[][];
  previewErrors?: ImportRowError[];
  validCount?: number;
  errorCount?: number;
}

/** Review screen: validate the assembled plan and dry-run it. No writes. */
export async function dryRunImportAction(input: { csvText: string; plan: unknown }): Promise<DryRunResult> {
  try {
    const organization = await getCurrentOrganization();
    if (!organization) throw new Error("No organization");
    await requirePeople(organization.id, "person.import");

    const records = parseWithCaps(input.csvText);
    const validated = validateMappingPlan(input.plan, records[0] ?? []);
    if (!validated.ok) return { ok: false, error: validated.errors[0] };

    const campuses = await campusService.listCampuses(organization.id);
    const mappedRecords = applyMappingPlan(records, validated.plan);
    const { rows, errors } = mapImportRows(mappedRecords, campuses);
    return {
      ok: true,
      preview: mappedRecords.slice(0, 7),
      previewErrors: errors.slice(0, 8),
      validCount: rows.length,
      errorCount: errors.length,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not preview the import" };
  }
}

export interface RunImportResult {
  ok: boolean;
  error?: string;
  summary?: {
    createdCount: number;
    skippedCount: number;
    errorCount: number;
    errors: ImportRowError[];
  };
}

/**
 * Final step, after the user confirmed the reviewed plan. Same deterministic
 * pipeline as always; the round-tripped plan is re-validated against the file's
 * real headers before a single row is written.
 */
export async function runImportAction(input: {
  csvText: string;
  fileName: string | null;
  plan: unknown;
  usedAi: boolean;
}): Promise<RunImportResult> {
  try {
    const organization = await getCurrentOrganization();
    if (!organization) throw new Error("No organization");
    await requirePeople(organization.id, "person.import");

    const records = parseWithCaps(input.csvText);
    const validated = validateMappingPlan(input.plan, records[0] ?? []);
    if (!validated.ok) return { ok: false, error: `The mapping plan is no longer valid (${validated.errors[0]}).` };

    const campuses = await campusService.listCampuses(organization.id);
    const { rows, errors } = mapImportRows(applyMappingPlan(records, validated.plan), campuses);

    const actor = await getCurrentUser();
    const result = await peopleService.importPeople(organization.id, {
      rows,
      parseErrors: errors,
      totalRows: Math.max(0, records.length - 1),
      fileName: input.fileName,
      createdByUserId: actor?.id ?? null,
    });

    // ADR-007: record whether AI assisted and with which model, for provenance.
    await auditService.recordAuditEvent({
      organizationId: organization.id,
      actorUserId: actor?.id,
      action: "people.imported",
      targetType: "PersonImport",
      targetId: result.importId,
      metadata: {
        fileName: input.fileName,
        createdCount: result.createdCount,
        skippedCount: result.skippedCount,
        errorCount: result.errorCount,
        aiAssisted: input.usedAi,
        ...(input.usedAi ? { aiModel: AI_IMPORT_MODEL, aiPlanSummary: validated.plan.summary } : {}),
      },
    });

    revalidatePath("/people");
    revalidatePath("/people/import");
    return {
      ok: true,
      summary: {
        createdCount: result.createdCount,
        skippedCount: result.skippedCount,
        errorCount: result.errorCount,
        errors: result.errors,
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Import failed" };
  }
}
