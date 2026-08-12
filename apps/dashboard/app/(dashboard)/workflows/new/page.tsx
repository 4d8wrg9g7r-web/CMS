import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { formService } from "@cms/database";
import { buttonClasses } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { Input, Select, Textarea } from "../../../../components/ui/Input";
import { TRIGGER_OPTIONS } from "../../../../lib/workflows-format";
import { requireWorkflows } from "../../../../lib/workflows-access";
import { getCurrentOrganization } from "../../../../lib/session";
import { createWorkflowAction } from "../actions";

export default async function NewWorkflowPage() {
  const organization = await getCurrentOrganization();
  if (!organization) return null;
  await requireWorkflows(organization.id, "workflow.manage");

  const forms = await formService.listForms(organization.id);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/workflows" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
        <ArrowLeft size={15} /> Back to Workflows
      </Link>
      <h1 className="mb-1 text-display text-[28px] leading-tight text-ink">Create a workflow</h1>
      <p className="mb-6 text-sm text-ink-secondary">Pick a trigger, then add conditions and steps.</p>
      <Card padding="md">
        <form action={createWorkflowAction} className="space-y-4">
          <label className="block text-sm text-ink-secondary">
            Name <span className="text-danger">*</span>
            <Input name="name" required placeholder="Connect Card follow-up" className="mt-1" />
          </label>
          <label className="block text-sm text-ink-secondary">
            Description
            <Textarea name="description" rows={2} className="mt-1" />
          </label>
          <label className="block text-sm text-ink-secondary">
            Trigger
            <Select name="trigger" defaultValue="FormSubmitted" className="mt-1">
              {TRIGGER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-sm text-ink-secondary">
            Limit to form <span className="text-ink-muted">(Form submitted trigger only; blank = any form)</span>
            <Select name="triggerFormId" defaultValue="" className="mt-1">
              <option value="">Any form</option>
              {forms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              ))}
            </Select>
          </label>
          <button type="submit" className={buttonClasses("primary", "md")}>
            Create workflow
          </button>
        </form>
      </Card>
    </div>
  );
}
