import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonClasses } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { Input, Textarea } from "../../../../components/ui/Input";
import { requireForms } from "../../../../lib/forms-access";
import { getCurrentOrganization } from "../../../../lib/session";
import { createFormAction } from "../actions";

export default async function NewFormPage() {
  const organization = await getCurrentOrganization();
  if (!organization) return null;
  await requireForms(organization.id, "form.manage");

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/forms" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
        <ArrowLeft size={15} /> Back to Forms
      </Link>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-ink">Create a form</h1>
      <p className="mb-6 text-sm text-ink-secondary">Name it, then add fields and publish.</p>
      <Card padding="md">
        <form action={createFormAction} className="space-y-4">
          <label className="block text-sm text-ink-secondary">
            Title <span className="text-danger">*</span>
            <Input name="title" required placeholder="Connect Card" className="mt-1" />
          </label>
          <label className="block text-sm text-ink-secondary">
            Description
            <Textarea name="description" rows={2} className="mt-1" />
          </label>
          <button type="submit" className={buttonClasses("primary", "md")}>
            Create form
          </button>
        </form>
      </Card>
    </div>
  );
}
