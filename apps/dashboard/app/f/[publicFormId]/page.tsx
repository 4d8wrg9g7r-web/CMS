import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { after } from "next/server";
import { CheckCircle2 } from "lucide-react";
import { auditService, formService, formSubmissionService, type FormField } from "@cms/database";
import { Card } from "../../../components/ui/Card";
import { Input, Select, Textarea } from "../../../components/ui/Input";
import { SubmitButton } from "../../../components/SubmitButton";
import { checkRateLimit, getClientIp } from "../../../lib/rate-limit";
import { drainOutbox } from "../../../lib/outbox-worker";

/**
 * Public, unauthenticated form submission surface. Resolved entirely by the form's
 * publicId (the same boundary as the widget embed / prayer wall) -- deliberately NOT under
 * the (dashboard) layout and NOT in the middleware matcher. The server action re-resolves
 * the form (never trusts the client), validates server-side, rate-limits, and stores.
 */

async function submitFormAction(publicFormId: string, formData: FormData) {
  "use server";
  const form = await formService.resolvePublicForm(publicFormId);
  if (!form) redirect(`/f/${publicFormId}?error=unavailable`);

  const ip = getClientIp(await headers());
  const rate = checkRateLimit(`form-submit-ip:${form.organizationId}:${ip ?? "unknown"}`, 20, 60 * 60 * 1000);
  if (!rate.allowed) redirect(`/f/${publicFormId}?error=rate_limited`);

  // Build raw answers keyed by field id from the post. Unknown keys are ignored by the
  // validator; checkboxes arrive as "on" when checked.
  const raw: Record<string, unknown> = {};
  for (const field of form.fields) {
    raw[field.id] = formData.get(field.id);
  }

  const result = await formSubmissionService.submitForm(form, raw);
  if (!result.ok) redirect(`/f/${publicFormId}?error=validation`);

  await auditService.recordAuditEvent({
    organizationId: form.organizationId,
    actorUserId: null,
    action: "form.submission_received",
    targetType: "FormDefinition",
    targetId: form.id,
    metadata: { version: form.version, personId: result.personId },
  });

  // Low-latency drain of the FormSubmitted event after the response is sent. The
  // /api/cron/outbox route is the durable backstop if this best-effort pass is skipped.
  after(async () => {
    try {
      await drainOutbox();
    } catch (err) {
      console.error("Opportunistic outbox drain failed (cron will retry):", err);
    }
  });

  redirect(`/f/${publicFormId}?submitted=1`);
}

const ERROR_MESSAGES: Record<string, string> = {
  unavailable: "This form is no longer accepting responses.",
  rate_limited: "You've submitted several times recently — please try again later.",
  validation: "Some answers weren't valid. Please check the form and try again.",
};

function PublicField({ field }: { field: FormField }) {
  const common = { name: field.id, required: field.required, className: "mt-1" };
  const label = (
    <span className="text-sm text-ink-secondary">
      {field.label}
      {field.required && <span className="text-danger"> *</span>}
      {field.helpText && <span className="block text-xs font-normal text-ink-muted">{field.helpText}</span>}
    </span>
  );

  if (field.type === "CHECKBOX") {
    return (
      <label className="flex items-center gap-2 text-sm text-ink-secondary">
        <input type="checkbox" name={field.id} className="h-4 w-4 rounded border-border-strong text-accent" />
        {field.label}
        {field.required && <span className="text-danger">*</span>}
      </label>
    );
  }

  return (
    <label className="block">
      {label}
      {field.type === "LONG_TEXT" ? (
        <Textarea {...common} rows={4} />
      ) : field.type === "DROPDOWN" ? (
        <Select {...common} defaultValue="">
          <option value="" disabled>
            Choose one…
          </option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      ) : (
        <Input
          {...common}
          type={
            field.type === "EMAIL" ? "email" : field.type === "NUMBER" ? "number" : field.type === "DATE" ? "date" : field.type === "PHONE" ? "tel" : "text"
          }
        />
      )}
    </label>
  );
}

export default async function PublicFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicFormId: string }>;
  searchParams: Promise<{ submitted?: string; error?: string }>;
}) {
  const { publicFormId } = await params;
  const sp = await searchParams;
  const form = await formService.resolvePublicForm(publicFormId);
  if (!form) notFound();

  const boundSubmit = submitFormAction.bind(null, publicFormId);

  return (
    <div className="min-h-screen bg-surface-muted">
      <main className="mx-auto max-w-xl px-6 py-12">
        {sp.submitted ? (
          <Card padding="md">
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle2 size={32} className="text-success" />
              <h1 className="text-lg font-semibold text-ink">{form.title}</h1>
              <p className="text-sm text-ink-secondary">{form.confirmationMessage}</p>
            </div>
          </Card>
        ) : (
          <>
            <h1 className="mb-1 text-2xl font-semibold tracking-tight text-ink">{form.title}</h1>
            {form.description && <p className="mb-6 text-sm text-ink-secondary">{form.description}</p>}
            {sp.error && (
              <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
                {ERROR_MESSAGES[sp.error] ?? "Something went wrong."}
              </p>
            )}
            <Card padding="md">
              <form action={boundSubmit} className="flex flex-col gap-4">
                {form.fields.map((field) => (
                  <PublicField key={field.id} field={field} />
                ))}
                <div className="flex justify-end pt-2">
                  <SubmitButton pendingLabel="Submitting…">Submit</SubmitButton>
                </div>
              </form>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
