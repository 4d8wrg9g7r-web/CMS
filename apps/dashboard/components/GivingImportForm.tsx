"use client";

import { useActionState } from "react";
import { Upload } from "lucide-react";
import { buttonClasses } from "./ui/Button";
import { Select } from "./ui/Input";
import type { GivingImportState } from "../app/(dashboard)/giving/actions";

/**
 * Check-scanner / bank CSV import into an open batch. Works with any export that
 * has date+amount columns (scanner software, bank downloads); results render once
 * from the action's return value.
 */
export function GivingImportForm({
  action,
  funds,
}: {
  action: (prev: GivingImportState, formData: FormData) => Promise<GivingImportState>;
  funds: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(action, { summary: null, error: null });

  return (
    <div>
      <form action={formAction} className="flex flex-col gap-3">
        <label className="text-sm text-ink-secondary">
          Scanner / bank CSV file
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
            rows={4}
            placeholder={"date,amount,check number,name,email\n01/05/2026,150.00,2044,Dana Whitfield,dana@example.org"}
            className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </label>
        <label className="text-sm text-ink-secondary">
          Fund for rows without a fund column
          <Select name="defaultFundId" className="mt-1 block w-full">
            {funds.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </label>
        <div>
          <button type="submit" disabled={pending} className={buttonClasses("secondary", "md")}>
            <Upload size={15} /> {pending ? "Importing…" : "Import rows"}
          </button>
        </div>
      </form>

      {state.error && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</p>}
      {state.summary && (
        <div className="mt-3 rounded-md border border-border bg-surface-muted p-3 text-sm">
          <p className="font-medium text-ink">
            Imported {state.summary.createdCount} {state.summary.createdCount === 1 ? "entry" : "entries"} —{" "}
            {state.summary.matchedCount} matched to people by email
            {state.summary.unmatchedCount > 0 && `, ${state.summary.unmatchedCount} kept by donor name`}
            {state.summary.errorCount > 0 && `, ${state.summary.errorCount} rows with errors`}.
          </p>
          {state.summary.errors.length > 0 && (
            <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-danger">
              {state.summary.errors.slice(0, 8).map((e) => (
                <li key={`${e.line}-${e.message}`}>
                  Line {e.line}: {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
