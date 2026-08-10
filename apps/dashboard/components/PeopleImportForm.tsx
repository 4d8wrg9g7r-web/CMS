"use client";

import { useActionState } from "react";
import { Upload } from "lucide-react";
import { buttonClasses } from "./ui/Button";
import type { ImportState } from "../app/(dashboard)/people/import/actions";

/**
 * Client wrapper so the import result (counts + per-line errors) renders once,
 * in memory, from the action's return value -- nothing about the file persists
 * beyond the PersonImport summary row.
 */
export function PeopleImportForm({
  action,
}: {
  action: (prev: ImportState, formData: FormData) => Promise<ImportState>;
}) {
  const [state, formAction, pending] = useActionState(action, { summary: null, error: null });

  return (
    <div>
      <form action={formAction} className="flex flex-col gap-3">
        <label className="text-sm text-ink-secondary">
          CSV file
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            className="mt-1 block w-full text-sm text-ink-secondary file:mr-3 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:bg-surface-muted"
          />
        </label>
        <label className="text-sm text-ink-secondary">
          …or paste CSV text
          <textarea
            name="csv"
            rows={6}
            placeholder={"firstName,lastName,email\nDana,Whitfield,dana@example.org"}
            className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </label>
        <div>
          <button type="submit" disabled={pending} className={buttonClasses("primary", "md")}>
            <Upload size={15} /> {pending ? "Importing…" : "Import people"}
          </button>
        </div>
      </form>

      {state.error && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</p>}

      {state.summary && (
        <div className="mt-4 rounded-md border border-border bg-surface-muted p-4 text-sm">
          <p className="font-medium text-ink">
            Imported {state.summary.createdCount} {state.summary.createdCount === 1 ? "person" : "people"}
            {state.summary.skippedCount > 0 && `, skipped ${state.summary.skippedCount} (email already exists)`}
            {state.summary.errorCount > 0 && `, ${state.summary.errorCount} row${state.summary.errorCount === 1 ? "" : "s"} with errors`}
            .
          </p>
          {state.summary.errors.length > 0 && (
            <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-danger">
              {state.summary.errors.map((e) => (
                <li key={`${e.line}-${e.message}`}>
                  Line {e.line}: {e.message}
                </li>
              ))}
              {state.summary.errorCount > state.summary.errors.length && (
                <li className="text-ink-muted">
                  …and {state.summary.errorCount - state.summary.errors.length} more.
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
