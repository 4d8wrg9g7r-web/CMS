import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pause, Play, Trash2, Undo2 } from "lucide-react";
import { formService, groupService, journeyService, parseSchema, parseWorkflowConfig, personDisplayName, teamService, workflowService } from "@cms/database";
import { Badge } from "../../../../components/ui/Badge";
import { buttonClasses } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { Input, Select, Textarea } from "../../../../components/ui/Input";
import { WorkflowBuilder } from "../../../../components/WorkflowBuilder";
import {
  TRIGGER_OPTIONS,
  runStatusLabel,
  runStatusTone,
  triggerLabel,
  workflowStatusLabel,
  workflowStatusTone,
} from "../../../../lib/workflows-format";
import { canWorkflows, requireWorkflows } from "../../../../lib/workflows-access";
import { getCurrentOrganization } from "../../../../lib/session";
import {
  archiveWorkflowAction,
  pauseWorkflowAction,
  publishWorkflowAction,
  restoreWorkflowAction,
  resumeWorkflowAction,
  saveWorkflowConfigAction,
  updateWorkflowSettingsAction,
} from "../actions";

export default async function WorkflowDetailPage({ params }: { params: Promise<{ workflowId: string }> }) {
  const organization = await getCurrentOrganization();
  if (!organization) return null;
  await requireWorkflows(organization.id, "workflow.view");
  const canManage = await canWorkflows(organization.id, "workflow.manage");

  const { workflowId } = await params;
  const workflow = await workflowService.getWorkflow(organization.id, workflowId);
  if (!workflow) notFound();

  const [groups, forms, runs, members, journeys] = await Promise.all([
    groupService.listGroups(organization.id),
    formService.listForms(organization.id),
    workflowService.listRuns(organization.id, workflow.id, { take: 20 }),
    teamService.listMembers(organization.id),
    journeyService.listJourneys(organization.id),
  ]);

  const draftConfig = parseWorkflowConfig(workflow.draftConfig);

  // Build a context hint so condition paths / {{placeholders}} are discoverable. When the
  // trigger is narrowed to one form, list its actual field ids.
  let contextHint = "Available paths: firstName, lastName, email, membershipStatus";
  if (workflow.trigger === "EventRegistered") {
    contextHint = "Available paths: eventId, eventTitle, registrantName, registrantEmail — narrow to one event with a condition on eventId";
  }
  if (workflow.trigger === "FormSubmitted") {
    contextHint = "Available paths: submitterName, submitterEmail, formTitle, answers.<fieldId>";
    if (workflow.triggerFormId) {
      const form = forms.find((f) => f.id === workflow.triggerFormId);
      if (form) {
        const fields = parseSchema(form.draftSchema);
        if (fields.length > 0) {
          contextHint = `Available paths: submitterName, submitterEmail, formTitle, ${fields
            .map((f) => `answers.${f.id} (${f.label})`)
            .join(", ")}`;
        }
      }
    }
  }

  return (
    <div>
      <Link href="/workflows" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
        <ArrowLeft size={15} /> Back to Workflows
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-display text-[28px] leading-tight text-ink">{workflow.name}</h1>
        <Badge variant="info">{triggerLabel(workflow.trigger)}</Badge>
        <Badge variant={workflowStatusTone(workflow.status)}>{workflowStatusLabel(workflow.status)}</Badge>
        {workflow.archivedAt && <Badge variant="warning">Archived</Badge>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <Card padding="md">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Automation</h2>
              {workflow.publishedVersion != null && (
                <span className="text-xs text-ink-muted">Live version v{workflow.publishedVersion}</span>
              )}
            </div>
            {canManage ? (
              <>
                <WorkflowBuilder
                  action={saveWorkflowConfigAction.bind(null, workflow.id)}
                  initialConfig={draftConfig}
                  groups={groups.map((g) => ({ id: g.id, name: g.name }))}
                  members={members.map((m) => ({ userId: m.userId, label: m.user.name || m.user.email }))}
                  journeys={journeys.map((j) => ({ id: j.id, name: j.name }))}
                  contextHint={contextHint}
                />
                <p className="mt-3 text-xs text-ink-muted">
                  Saving updates the draft. Changes take effect for new runs only when you publish; runs already in
                  flight keep the version they started with.
                </p>
              </>
            ) : (
              <p className="text-sm text-ink-secondary">
                {draftConfig.steps.length} step{draftConfig.steps.length === 1 ? "" : "s"} configured.
              </p>
            )}
          </Card>

          {/* Recent runs — §39 observability */}
          <Card padding="md">
            <h2 className="mb-4 text-sm font-semibold text-ink">Recent runs</h2>
            {runs.length === 0 ? (
              <p className="text-sm text-ink-muted">No runs yet. Runs appear when the trigger fires.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                      <th className="py-2 pr-4 font-medium">Started</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 pr-4 font-medium">Person</th>
                      <th className="py-2 pr-4 font-medium">Version</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => (
                      <tr key={run.id} className="border-b border-border/60 last:border-0 hover:bg-surface-muted">
                        <td className="py-2 pr-4">
                          <Link href={`/workflows/${workflow.id}/runs/${run.id}`} className="text-ink hover:text-accent">
                            {new Date(run.createdAt).toLocaleString()}
                          </Link>
                        </td>
                        <td className="py-2 pr-4">
                          <Badge variant={runStatusTone(run.status)}>{runStatusLabel(run.status)}</Badge>
                        </td>
                        <td className="py-2 pr-4 text-ink-secondary">
                          {run.person ? personDisplayName(run.person) : "—"}
                        </td>
                        <td className="py-2 pr-4 text-ink-muted">v{run.version}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {canManage && (
            <Card padding="md">
              <h2 className="mb-4 text-sm font-semibold text-ink">Settings</h2>
              <form action={updateWorkflowSettingsAction.bind(null, workflow.id)} className="space-y-4">
                <label className="block text-sm text-ink-secondary">
                  Name
                  <Input name="name" defaultValue={workflow.name} required className="mt-1" />
                </label>
                <label className="block text-sm text-ink-secondary">
                  Description
                  <Textarea name="description" rows={2} defaultValue={workflow.description ?? ""} className="mt-1" />
                </label>
                <label className="block text-sm text-ink-secondary">
                  Trigger
                  <Select name="trigger" defaultValue={workflow.trigger} className="mt-1">
                    {TRIGGER_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="block text-sm text-ink-secondary">
                  Limit to form <span className="text-ink-muted">(blank = any form)</span>
                  <Select name="triggerFormId" defaultValue={workflow.triggerFormId ?? ""} className="mt-1">
                    <option value="">Any form</option>
                    {forms.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.title}
                      </option>
                    ))}
                  </Select>
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
              {workflow.status === "PUBLISHED" ? (
                <>
                  <p className="mb-3 text-xs text-ink-muted">Active — the trigger starts new runs.</p>
                  <form action={publishWorkflowAction.bind(null, workflow.id)} className="mb-2">
                    <button type="submit" className={buttonClasses("primary", "sm") + " w-full"}>
                      Publish draft changes
                    </button>
                  </form>
                  <form action={pauseWorkflowAction.bind(null, workflow.id)}>
                    <button type="submit" className={buttonClasses("secondary", "sm") + " w-full"}>
                      <Pause size={14} /> Pause
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <p className="mb-3 text-xs text-ink-muted">
                    {workflow.status === "PAUSED"
                      ? "Paused — the trigger is ignored. In-flight runs still finish."
                      : "Publishing snapshots the current steps as a new version and activates the trigger."}
                  </p>
                  {workflow.status === "PAUSED" && workflow.publishedVersion != null && (
                    <form action={resumeWorkflowAction.bind(null, workflow.id)} className="mb-2">
                      <button type="submit" className={buttonClasses("primary", "sm") + " w-full"}>
                        <Play size={14} /> Resume
                      </button>
                    </form>
                  )}
                  <form action={publishWorkflowAction.bind(null, workflow.id)}>
                    <button
                      type="submit"
                      disabled={draftConfig.steps.length === 0}
                      className={buttonClasses(workflow.status === "PAUSED" ? "secondary" : "primary", "sm") + " w-full"}
                    >
                      Publish {workflow.publishedVersion != null ? "new version" : "workflow"}
                    </button>
                  </form>
                  {draftConfig.steps.length === 0 && <p className="mt-2 text-xs text-ink-muted">Add at least one step first.</p>}
                </>
              )}
            </Card>
          )}

          {canManage && (
            <Card padding="md">
              <h2 className="mb-2 text-sm font-semibold text-ink">Status</h2>
              {workflow.archivedAt ? (
                <form action={restoreWorkflowAction.bind(null, workflow.id)}>
                  <button type="submit" className={buttonClasses("secondary", "sm") + " w-full"}>
                    <Undo2 size={14} /> Restore workflow
                  </button>
                </form>
              ) : (
                <form action={archiveWorkflowAction.bind(null, workflow.id)}>
                  <button type="submit" className={buttonClasses("danger", "sm") + " w-full"}>
                    <Trash2 size={14} /> Archive workflow
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
