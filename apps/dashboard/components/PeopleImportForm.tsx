"use client";

import { useActionState } from "react";
import { Sparkles, Upload } from "lucide-react";
import { buttonClasses } from "./ui/Button";
import type { AnalyzeState, ImportState } from "../app/(dashboard)/people/import/actions";

/**
 * Client wrapper for both import paths. Direct import posts straight to
 * importPeopleAction; the AI path is two steps — analyzeImportAction returns a
 * mapping plan + dry-run preview rendered here for human review, and only the
 * explicit confirm submit (importWithPlanAction) writes anything. All results
 * render once, in memory, from action return values.
 */
export function PeopleImportForm({
  action,
  analyzeAction,
  confirmAction,
  aiAvailable,
}: {
  action: (prev: ImportState, formData: FormData) => Promise<ImportState>;
  analyzeAction: (prev: AnalyzeState, formData: FormData) => Promise<AnalyzeState>;
  confirmAction: (prev: ImportState, formData: FormData) => Promise<ImportState>;
  aiAvailable: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, { summary: null, error: null });
  const [analyzeState, analyzeFormAction, analyzing] = useActionState(analyzeAction, { analysis: null, error: null });
  const [confirmState, confirmFormAction, confirming] = useActionState(confirmAction, { summary: null, error: null });

  const analysis = confirmState.summary ? null : analyzeState.analysis;
  const busy = pending || analyzing || confirming;
  const summary = state.summary ?? confirmState.summary;
  const error = state.error ?? analyzeState.error ?? confirmState.error;

  return (
    <div>
      <form className="flex flex-col gap-3">
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
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" formAction={formAction} disabled={busy} className={buttonClasses("primary", "md")}>
            <Upload size={15} /> {pending ? "Importing…" : "Import people"}
          </button>
          {aiAvailable && (
            <button type="submit" formAction={analyzeFormAction} disabled={busy} className={buttonClasses("secondary", "md")}>
              <Sparkles size={15} /> {analyzing ? "Analyzing…" : "Analyze with AI"}
            </button>
          )}
        </div>
        {aiAvailable && (
          <p className="text-xs text-ink-muted">
            Analyze with AI handles files whose columns don&apos;t match the format above: Claude proposes a column
            mapping and value translations for your review — nothing imports until you confirm. Column names and a
            few sample values per column are sent to Anthropic&apos;s Claude API with emails and phone numbers masked.
          </p>
        )}
      </form>

      {error && <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}

      {analysis && (
        <div className="mt-4 rounded-md border border-border bg-surface-muted p-4 text-sm">
          <h3 className="mb-1 flex items-center gap-1.5 font-semibold text-ink">
            <Sparkles size={14} /> Proposed mapping — review before importing
          </h3>
          <p className="mb-3 text-xs text-ink-secondary">{analysis.plan.summary}</p>

          <div className="mb-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-ink-muted">
                  <th className="pb-1 pr-4 font-medium">Your column</th>
                  <th className="pb-1 font-medium">Imports as</th>
                </tr>
              </thead>
              <tbody>
                {analysis.plan.columns.map((c) => (
                  <tr key={c.sourceHeader} className="border-t border-border">
                    <td className="py-1 pr-4 font-mono">{c.sourceHeader}</td>
                    <td className={`py-1 ${c.target === "ignore" ? "text-ink-muted" : "text-ink"}`}>
                      {c.target === "ignore" ? "not imported" : c.target}
                      {c.target === "fullName" && ` (split into first + last${c.nameOrder === "lastFirst" ? ", last name first" : ""})`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {analysis.plan.statusRules.length > 0 && (
            <p className="mb-3 text-xs text-ink-secondary">
              Status translations:{" "}
              {analysis.plan.statusRules.map((r) => `“${r.sourceValue}” → ${r.status}`).join(", ")}
            </p>
          )}

          <div className="mb-3 overflow-x-auto rounded border border-border bg-surface">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-ink-muted">
                  {analysis.preview[0]?.map((h) => (
                    <th key={h} className="px-2 py-1 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {analysis.preview.slice(1).map((row, i) => (
                  <tr key={i} className="border-t border-border">
                    {row.map((cell, j) => (
                      <td key={j} className="px-2 py-1">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mb-1 text-xs text-ink-secondary">
            {analysis.validCount} row{analysis.validCount === 1 ? "" : "s"} ready to import
            {analysis.errorCount > 0 && `, ${analysis.errorCount} with errors (reported per line after import)`}.
          </p>
          {analysis.previewErrors.length > 0 && (
            <ul className="mb-2 list-inside list-disc space-y-0.5 text-xs text-danger">
              {analysis.previewErrors.map((e) => (
                <li key={`${e.line}-${e.message}`}>
                  Line {e.line}: {e.message}
                </li>
              ))}
            </ul>
          )}

          <form action={confirmFormAction} className="mt-2">
            <input type="hidden" name="csvText" value={analysis.csvText} />
            <input type="hidden" name="plan" value={analysis.planJson} />
            <input type="hidden" name="fileName" value={analysis.fileName ?? ""} />
            <button type="submit" disabled={busy} className={buttonClasses("primary", "md")}>
              <Upload size={15} />{" "}
              {confirming ? "Importing…" : `Import ${analysis.validCount} ${analysis.validCount === 1 ? "person" : "people"}`}
            </button>
          </form>
        </div>
      )}

      {summary && (
        <div className="mt-4 rounded-md border border-border bg-surface-muted p-4 text-sm">
          <p className="font-medium text-ink">
            Imported {summary.createdCount} {summary.createdCount === 1 ? "person" : "people"}
            {summary.skippedCount > 0 && `, skipped ${summary.skippedCount} (email already exists)`}
            {summary.errorCount > 0 && `, ${summary.errorCount} row${summary.errorCount === 1 ? "" : "s"} with errors`}
            .
          </p>
          {summary.errors.length > 0 && (
            <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-danger">
              {summary.errors.map((e) => (
                <li key={`${e.line}-${e.message}`}>
                  Line {e.line}: {e.message}
                </li>
              ))}
              {summary.errorCount > summary.errors.length && (
                <li className="text-ink-muted">…and {summary.errorCount - summary.errors.length} more.</li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
