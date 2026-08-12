import Link from "next/link";
import { ClipboardList, Lock, Plus } from "lucide-react";
import { formService } from "@cms/database";
import { Badge } from "../../../components/ui/Badge";
import { buttonClasses } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { formStatusLabel, formStatusTone } from "../../../lib/forms-format";
import { canForms } from "../../../lib/forms-access";
import { getCurrentOrganization } from "../../../lib/session";

export default async function FormsPage() {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  const [canView, canManage] = await Promise.all([
    canForms(organization.id, "form.view"),
    canForms(organization.id, "form.manage"),
  ]);

  if (!canView) {
    return (
      <div>
        <h1 className="mb-1 text-display text-[28px] leading-tight text-ink">Forms</h1>
        <Card padding="md" className="mt-6">
          <EmptyState
            icon={<Lock size={22} />}
            title="You don't have access to Forms"
            description="Forms and submissions are restricted to organization owners and admins."
          />
        </Card>
      </div>
    );
  }

  const forms = await formService.listForms(organization.id);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-display text-[28px] leading-tight text-ink">Forms</h1>
          <p className="text-sm text-ink-secondary">
            Build public forms that turn submissions into People and structured records.
          </p>
        </div>
        {canManage && (
          <Link href="/forms/new" className={buttonClasses("primary", "md")}>
            <Plus size={16} /> New form
          </Link>
        )}
      </div>

      {forms.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<ClipboardList size={22} />}
            title="No forms yet"
            description="Create a connect card, RSVP, or interest form and share its public link."
            action={
              canManage ? (
                <Link href="/forms/new" className={buttonClasses("primary", "sm")}>
                  <Plus size={15} /> New form
                </Link>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-5 py-3 font-medium">Title</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Submissions</th>
                  <th className="px-5 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {forms.map((form) => (
                  <tr key={form.id} className="border-b border-border/60 last:border-0 hover:bg-surface-muted">
                    <td className="px-5 py-3">
                      <Link href={`/forms/${form.id}`} className="font-medium text-ink hover:text-accent">
                        {form.title}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={formStatusTone(form.status)}>{formStatusLabel(form.status)}</Badge>
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">
                      <Link href={`/forms/${form.id}/submissions`} className="hover:text-accent">
                        {form._count.submissions}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">{new Date(form.updatedAt).toLocaleDateString()}</td>
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
