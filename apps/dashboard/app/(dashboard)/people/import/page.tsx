import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { peopleService } from "@cms/database";
import { PeopleImportWizard } from "../../../../components/PeopleImportWizard";
import { Card } from "../../../../components/ui/Card";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { canPeople } from "../../../../lib/people-access";
import { getCurrentOrganization } from "../../../../lib/session";
import { timeAgo } from "../../../../lib/format";

export default async function PeopleImportPage() {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  const allowed = await canPeople(organization.id, "person.import");
  if (!allowed) {
    return (
      <div>
        <h1 className="mb-1 text-display text-[28px] leading-tight text-ink">Import people</h1>
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

      <Card padding="md" className="mb-6 py-14">
        <PeopleImportWizard />
      </Card>

      <p className="mb-6 text-center text-xs text-ink-muted">
        Rows whose email already exists are skipped, so re-running an import is always safe. Imports never trigger
        workflows. Campus values must match a campus in Settings.
      </p>

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
