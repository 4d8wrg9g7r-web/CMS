import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Inbox } from "lucide-react";
import { formService, formSubmissionService, personDisplayName } from "@cms/database";
import { Card } from "../../../../../components/ui/Card";
import { EmptyState } from "../../../../../components/ui/EmptyState";
import { requireForms } from "../../../../../lib/forms-access";
import { getCurrentOrganization } from "../../../../../lib/session";

export default async function FormSubmissionsPage({ params }: { params: Promise<{ formId: string }> }) {
  const organization = await getCurrentOrganization();
  if (!organization) return null;
  await requireForms(organization.id, "form.view");

  const { formId } = await params;
  const form = await formService.getForm(organization.id, formId);
  if (!form) notFound();

  const submissions = await formSubmissionService.listSubmissions(organization.id, formId, { take: 100 });

  return (
    <div>
      <Link
        href={`/forms/${formId}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink"
      >
        <ArrowLeft size={15} /> Back to {form.title}
      </Link>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-ink">Submissions</h1>
      <p className="mb-6 text-sm text-ink-secondary">{form.title}</p>

      {submissions.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<Inbox size={22} />}
            title="No submissions yet"
            description="Responses will appear here once people submit the published form."
          />
        </Card>
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-5 py-3 font-medium">Submitted</th>
                  <th className="px-5 py-3 font-medium">From</th>
                  <th className="px-5 py-3 font-medium">Person</th>
                  <th className="px-5 py-3 font-medium">Version</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((s) => (
                  <tr key={s.id} className="border-b border-border/60 last:border-0 hover:bg-surface-muted">
                    <td className="px-5 py-3">
                      <Link
                        href={`/forms/${formId}/submissions/${s.id}`}
                        className="font-medium text-ink hover:text-accent"
                      >
                        {new Date(s.createdAt).toLocaleString()}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">
                      {s.submitterName || s.submitterEmail || "Anonymous"}
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">
                      {s.person ? (
                        <Link href={`/people/${s.person.id}`} className="hover:text-accent">
                          {personDisplayName(s.person)}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-5 py-3 text-ink-muted">v{s.version}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
