import Link from "next/link";
import { ArrowLeft, FileSpreadsheet, Lock } from "lucide-react";
import { peopleService, IMPORT_HEADERS, MAX_IMPORT_ROWS } from "@cms/database";
import { PeopleImportForm } from "../../../../components/PeopleImportForm";
import { Card } from "../../../../components/ui/Card";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { canPeople } from "../../../../lib/people-access";
import { getCurrentOrganization } from "../../../../lib/session";
import { timeAgo } from "../../../../lib/format";
import { aiImportAvailable } from "../../../../lib/ai/import-mapper";
import { analyzeImportAction, importPeopleAction, importWithPlanAction } from "./actions";

export default async function PeopleImportPage() {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  const allowed = await canPeople(organization.id, "person.import");
  if (!allowed) {
    return (
      <div>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-ink">Import people</h1>
        <Card padding="md" className="mt-6">
          <EmptyState
            icon={<Lock size={22} />}
            title="You don't have access to import people"
            description="CSV imports are restricted to organization owners and admins."
          />
        </Card>
      </div>
    );
  }

  const history = await peopleService.listImports(organization.id);

  return (
    <div>
      <Link href="/people" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
        <ArrowLeft size={14} /> Back to People
      </Link>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-ink">Import people</h1>
      <p className="mb-6 text-sm text-ink-secondary">
        Bulk-add people from a spreadsheet export. Rows whose email already exists are skipped, so re-running an
        import is always safe.
      </p>

      <Card padding="md" className="mb-6">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
          <FileSpreadsheet size={15} /> CSV format
        </h2>
        <p className="mb-1 text-xs text-ink-muted">
          Header row (any order, extra columns ignored):{" "}
          <code className="rounded bg-surface-muted px-1">{IMPORT_HEADERS.join(",")}</code>
        </p>
        <p className="mb-4 text-xs text-ink-muted">
          Only firstName and lastName are required. membershipStatus: VISITOR, ATTENDER, MEMBER, or INACTIVE (blank
          = VISITOR). tags are ;-separated. campus must match an existing campus name (create them in Settings).
          Max {MAX_IMPORT_ROWS.toLocaleString()} rows / 1 MB per run. Imports never trigger workflows. Columns from
          another system don&apos;t need to match — use Analyze with AI below.
        </p>
        <PeopleImportForm
          action={importPeopleAction}
          analyzeAction={analyzeImportAction}
          confirmAction={importWithPlanAction}
          aiAvailable={aiImportAvailable()}
        />
      </Card>

      {history.length > 0 && (
        <Card padding="md">
          <h2 className="mb-3 text-sm font-semibold text-ink">Recent imports</h2>
          <ul className="divide-y divide-border text-sm">
            {history.map((run) => (
              <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <span className="font-medium text-ink">{run.fileName ?? "Pasted CSV"}</span>
                  <span className="ml-2 text-xs text-ink-muted">
                    {run.createdBy?.name || run.createdBy?.email || "Unknown"} · {timeAgo(run.createdAt)}
                  </span>
                </div>
                <span className="text-xs text-ink-secondary">
                  {run.createdCount} created · {run.skippedCount} skipped · {run.errorCount} errors
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
