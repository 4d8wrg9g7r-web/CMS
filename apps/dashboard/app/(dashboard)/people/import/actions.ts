"use server";

import { revalidatePath } from "next/cache";
import {
  auditService,
  campusService,
  mapImportRows,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  parseCsv,
  peopleService,
  type ImportRowError,
} from "@cms/database";
import { getCurrentOrganization, getCurrentUser } from "../../../../lib/session";
import { requirePeople } from "../../../../lib/people-access";

export interface ImportState {
  summary: {
    createdCount: number;
    skippedCount: number;
    errorCount: number;
    errors: ImportRowError[];
  } | null;
  error: string | null;
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
