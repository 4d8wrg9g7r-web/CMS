import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, UserCheck } from "lucide-react";
import { formService, formSubmissionService, personDisplayName } from "@cms/database";
import { Card } from "../../../../../../components/ui/Card";
import { requireForms } from "../../../../../../lib/forms-access";
import { getCurrentOrganization } from "../../../../../../lib/session";

function renderValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export default async function SubmissionDetailPage({
  params,
}: {
  params: Promise<{ formId: string; submissionId: string }>;
}) {
  const organization = await getCurrentOrganization();
  if (!organization) return null;
  await requireForms(organization.id, "form.view");

  const { formId, submissionId } = await params;
  const submission = await formSubmissionService.getSubmission(organization.id, submissionId);
  if (!submission || submission.formId !== formId) notFound();

  // The versioning payoff: render answers against the exact schema version this was
  // answered with, not the current draft (BLUEPRINT §7).
  const schema = await formService.getVersionSchema(organization.id, formId, submission.version);
  const data = (submission.data ?? {}) as Record<string, unknown>;

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/forms/${formId}/submissions`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink"
      >
        <ArrowLeft size={15} /> Back to submissions
      </Link>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Submission</h1>
        <span className="text-sm text-ink-muted">
          {new Date(submission.createdAt).toLocaleString()} · v{submission.version}
        </span>
      </div>

      {submission.person && (
        <Card padding="sm" className="mb-4">
          <div className="flex items-center gap-2 text-sm">
            <UserCheck size={16} className="text-success" />
            <span className="text-ink-secondary">Linked to person:</span>
            <Link href={`/people/${submission.person.id}`} className="font-medium text-ink hover:text-accent">
              {personDisplayName(submission.person)}
            </Link>
          </div>
        </Card>
      )}

      <Card padding="md">
        {schema && schema.length > 0 ? (
          <dl className="space-y-4">
            {schema.map((field) => (
              <div key={field.id}>
                <dt className="text-xs uppercase tracking-wide text-ink-muted">{field.label}</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-ink">{renderValue(data[field.id])}</dd>
              </div>
            ))}
          </dl>
        ) : (
          // Fallback if the version schema is somehow missing: show raw keys so data is
          // never hidden.
          <dl className="space-y-4">
            {Object.entries(data).map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs uppercase tracking-wide text-ink-muted">{key}</dt>
                <dd className="mt-0.5 text-ink">{renderValue(value)}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>
    </div>
  );
}
