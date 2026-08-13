"use server";

import { revalidatePath } from "next/cache";
import {
  applyMappingPlan,
  auditService,
  buildWizardColumns,
  campusService,
  detectTagDelimiter,
  extractExtraColumns,
  guessMappingColumns,
  inferFieldType,
  mapImportRows,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  parseCsv,
  peopleService,
  slugifyFieldKey,
  validateMappingPlan,
  type ImportRowError,
  type MappingColumn,
  type MappingPlan,
  type WizardColumn,
} from "@cms/database";
import type { PersonFieldType } from "@cms/database";
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
  /** Suggested storage type per column, for "How should this be stored?" screens. */
  inferredTypes: PersonFieldType[];
  /** Per column: the org's existing custom field this header would reuse, if any. */
  existingFields: ({ label: string; type: PersonFieldType } | null)[];
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
      throw new Error("That file is larger than 5 MB — split it and import in parts.");
    }
    csvText = await file.text();
    fileName = file.name;
  }
  if (!csvText) throw new Error("Choose a CSV file or paste CSV text.");
  if (csvText.length > MAX_IMPORT_BYTES) {
    throw new Error("That CSV is larger than 5 MB — split it and import in parts.");
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
    const fieldDefs = await peopleService.listFieldDefinitions(organization.id);
    const defByKey = new Map(fieldDefs.map((d) => [d.key, d]));

    // Type inference wants every value in the column, not the display-capped sample.
    const inferredTypes = (records[0] ?? []).map((_, col) => {
      const values: string[] = [];
      for (let r = 1; r < records.length; r++) {
        const raw = (records[r]![col] ?? "").trim();
        if (raw) values.push(raw);
      }
      return inferFieldType(values, columns[col]?.distinctCount ?? 0);
    });

    return {
      data: {
        csvText,
        fileName,
        rowCount: records.length - 1,
        columns,
        guesses: guessMappingColumns(records[0] ?? []),
        delimiters: columns.map((c) => detectTagDelimiter(c.values)),
        inferredTypes,
        existingFields: columns.map((c) => {
          const def = defByKey.get(slugifyFieldKey(c.header));
          return def ? { label: def.label, type: def.type } : null;
        }),
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
  /** Custom fields this run would write (existing = reused definition). */
  newFields?: { label: string; type: PersonFieldType; existing: boolean }[];
  /** Distinct households the file's household column groups people into. */
  householdCount?: number;
}

/**
 * Everything both the dry run and the real import need, computed identically: the
 * validated plan, canonical rows merged with per-line extras (household + custom
 * values), the combined error list, and the resolved custom fields.
 */
async function resolveImport(organizationId: string, csvText: string, planInput: unknown) {
  const records = parseWithCaps(csvText);
  const validated = validateMappingPlan(planInput, records[0] ?? []);
  if (!validated.ok) throw new Error(validated.errors[0]);
  const plan = validated.plan;

  const campuses = await campusService.listCampuses(organizationId);
  const fieldDefs = await peopleService.listFieldDefinitions(organizationId);
  const mappedRecords = applyMappingPlan(records, plan);
  const { rows, errors } = mapImportRows(mappedRecords, campuses);
  const extras = extractExtraColumns(
    records,
    plan,
    fieldDefs.map((d) => ({ key: d.key, label: d.label, type: d.type, options: d.options })),
  );

  const extraErrorLines = new Set(extras.errors.map((e) => e.line));
  const mergedRows = rows
    .filter((r) => !extraErrorLines.has(r.line))
    .map((r) => ({ ...r, extras: extras.byLine.get(r.line) ?? { householdName: null, custom: {} } }));
  const allErrors = [...errors, ...extras.errors].sort((a, b) => a.line - b.line);
  const householdCount = new Set(
    mergedRows.map((r) => r.extras.householdName?.toLowerCase()).filter(Boolean),
  ).size;

  return { records, plan, mappedRecords, rows: mergedRows, errors: allErrors, fields: extras.fields, householdCount };
}

/** Review screen: validate the assembled plan and dry-run it. No writes. */
export async function dryRunImportAction(input: { csvText: string; plan: unknown }): Promise<DryRunResult> {
  try {
    const organization = await getCurrentOrganization();
    if (!organization) throw new Error("No organization");
    await requirePeople(organization.id, "person.import");

    const resolved = await resolveImport(organization.id, input.csvText, input.plan);
    return {
      ok: true,
      preview: resolved.mappedRecords.slice(0, 7),
      previewErrors: resolved.errors.slice(0, 8),
      validCount: resolved.rows.length,
      errorCount: resolved.errors.length,
      newFields: resolved.fields.map((f) => ({ label: f.label, type: f.type, existing: f.existing })),
      householdCount: resolved.householdCount,
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

    const resolved = await resolveImport(organization.id, input.csvText, input.plan);

    const actor = await getCurrentUser();
    const result = await peopleService.importPeople(organization.id, {
      rows: resolved.rows,
      parseErrors: resolved.errors,
      totalRows: Math.max(0, resolved.records.length - 1),
      fileName: input.fileName,
      createdByUserId: actor?.id ?? null,
      fields: resolved.fields,
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
        ...(input.usedAi ? { aiModel: AI_IMPORT_MODEL, aiPlanSummary: resolved.plan.summary } : {}),
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
