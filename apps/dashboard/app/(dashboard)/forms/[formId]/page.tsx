import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { ArrowLeft, ExternalLink, Inbox, Trash2, Undo2 } from "lucide-react";
import { formService, parseSchema } from "@cms/database";
import { Badge } from "../../../../components/ui/Badge";
import { buttonClasses } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { Input, Textarea } from "../../../../components/ui/Input";
import { FormBuilder } from "../../../../components/FormBuilder";
import { formStatusLabel, formStatusTone } from "../../../../lib/forms-format";
import { canForms, requireForms } from "../../../../lib/forms-access";
import { getCurrentOrganization } from "../../../../lib/session";
import {
  archiveFormAction,
  closeFormAction,
  publishFormAction,
  restoreFormAction,
  saveDraftSchemaAction,
  updateFormSettingsAction,
} from "../actions";

export default async function FormDetailPage({ params }: { params: Promise<{ formId: string }> }) {
  const organization = await getCurrentOrganization();
  if (!organization) return null;
  await requireForms(organization.id, "form.view");
  const canManage = await canForms(organization.id, "form.manage");

  const { formId } = await params;
  const form = await formService.getForm(organization.id, formId);
  if (!form) notFound();

  const draftFields = parseSchema(form.draftSchema);

  // Build the absolute public URL from request headers.
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const publicUrl = `${proto}://${host}/f/${form.publicId}`;

  const boundSaveSchema = saveDraftSchemaAction.bind(null, form.id);
  const boundSettings = updateFormSettingsAction.bind(null, form.id);

  return (
    <div>
      <Link href="/forms" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
        <ArrowLeft size={15} /> Back to Forms
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{form.title}</h1>
          <Badge variant={formStatusTone(form.status)}>{formStatusLabel(form.status)}</Badge>
          {form.archivedAt && <Badge variant="warning">Archived</Badge>}
        </div>
        <Link href={`/forms/${form.id}/submissions`} className={buttonClasses("secondary", "sm")}>
          <Inbox size={15} /> Submissions ({form._count.submissions})
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <Card padding="md">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Fields</h2>
              {form.publishedVersion != null && (
                <span className="text-xs text-ink-muted">Live version v{form.publishedVersion}</span>
              )}
            </div>
            {canManage ? (
              <>
                <FormBuilder action={boundSaveSchema} initialFields={draftFields} />
                <p className="mt-3 text-xs text-ink-muted">
                  Saving updates the draft. Changes go live to visitors only when you publish.
                </p>
              </>
            ) : (
              <ul className="space-y-1 text-sm text-ink-secondary">
                {draftFields.map((f) => (
                  <li key={f.id}>
                    {f.label} <span className="text-ink-muted">· {f.type.toLowerCase()}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {canManage && (
            <Card padding="md">
              <h2 className="mb-4 text-sm font-semibold text-ink">Settings</h2>
              <form action={boundSettings} className="space-y-4">
                <label className="block text-sm text-ink-secondary">
                  Title
                  <Input name="title" defaultValue={form.title} required className="mt-1" />
                </label>
                <label className="block text-sm text-ink-secondary">
                  Description
                  <Textarea name="description" rows={2} defaultValue={form.description ?? ""} className="mt-1" />
                </label>
                <label className="block text-sm text-ink-secondary">
                  Confirmation message
                  <Textarea
                    name="confirmationMessage"
                    rows={2}
                    defaultValue={form.confirmationMessage}
                    className="mt-1"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-ink-secondary">
                  <input
                    type="checkbox"
                    name="createPeople"
                    defaultChecked={form.createPeople}
                    className="h-4 w-4 rounded border-border-strong text-accent"
                  />
                  Match or create a Person from submissions
                </label>
                <label className="block text-sm text-ink-secondary">
                  Notify these emails on each submission
                  <span className="block text-xs font-normal text-ink-muted">
                    Comma- or line-separated. Sent asynchronously via the outbox worker.
                  </span>
                  <Textarea
                    name="notificationEmails"
                    rows={2}
                    defaultValue={form.notificationEmails.join(", ")}
                    placeholder="pastor@church.org, office@church.org"
                    className="mt-1"
                  />
                </label>
                <button type="submit" className={buttonClasses("primary", "md")}>
                  Save settings
                </button>
              </form>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          {canManage && (
            <Card padding="md">
              <h2 className="mb-3 text-sm font-semibold text-ink">Publish</h2>
              {form.status === "PUBLISHED" ? (
                <>
                  <p className="mb-2 text-xs text-ink-muted">This form is live. Share its link:</p>
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mb-3 flex items-center gap-1.5 break-all rounded-md border border-border bg-surface-muted px-3 py-2 text-xs text-accent hover:underline"
                  >
                    <ExternalLink size={13} className="shrink-0" /> {publicUrl}
                  </a>
                  <form action={publishFormAction.bind(null, form.id)} className="mb-2">
                    <button type="submit" className={buttonClasses("primary", "sm") + " w-full"}>
                      Publish draft changes
                    </button>
                  </form>
                  <form action={closeFormAction.bind(null, form.id)}>
                    <button type="submit" className={buttonClasses("secondary", "sm") + " w-full"}>
                      Close form
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <p className="mb-3 text-xs text-ink-muted">
                    {form.status === "CLOSED"
                      ? "This form is closed. Publish to reopen it."
                      : "Publishing makes the form live at a public link and snapshots the current fields as a new version."}
                  </p>
                  <form action={publishFormAction.bind(null, form.id)}>
                    <button
                      type="submit"
                      disabled={draftFields.length === 0}
                      className={buttonClasses("primary", "sm") + " w-full"}
                    >
                      {form.status === "CLOSED" ? "Reopen & publish" : "Publish form"}
                    </button>
                  </form>
                  {draftFields.length === 0 && (
                    <p className="mt-2 text-xs text-ink-muted">Add at least one field first.</p>
                  )}
                </>
              )}
            </Card>
          )}

          {canManage && (
            <Card padding="md">
              <h2 className="mb-2 text-sm font-semibold text-ink">Status</h2>
              {form.archivedAt ? (
                <form action={restoreFormAction.bind(null, form.id)}>
                  <button type="submit" className={buttonClasses("secondary", "sm") + " w-full"}>
                    <Undo2 size={14} /> Restore form
                  </button>
                </form>
              ) : (
                <form action={archiveFormAction.bind(null, form.id)}>
                  <button type="submit" className={buttonClasses("danger", "sm") + " w-full"}>
                    <Trash2 size={14} /> Archive form
                  </button>
                </form>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
