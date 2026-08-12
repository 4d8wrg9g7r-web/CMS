import Link from "next/link";
import { CheckSquare, ClipboardList, Mail, Map, Plus, Workflow as WorkflowIcon, Zap } from "lucide-react";
import { formService, journeyService, messageService, taskService, workflowService, isOverdue, personDisplayName } from "@cms/database";
import { Badge } from "../../../components/ui/Badge";
import { buttonClasses } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { PageHeader } from "../../../components/ui/PageHeader";
import { canMessages } from "../../../lib/messages-access";
import { canForms } from "../../../lib/forms-access";
import { canWorkflows } from "../../../lib/workflows-access";
import { canJourneys } from "../../../lib/journeys-access";
import { canTasks } from "../../../lib/tasks-access";
import { timeAgo } from "../../../lib/format";
import { getCurrentOrganization } from "../../../lib/session";

/**
 * Communicate (docs/design-system.md "Navigation"): one workspace tying
 * together the tools that reach people — messages, forms, automations,
 * journeys, and the follow-up tasks they produce. Every tile links into the
 * existing module; nothing new to learn, just one place to start from.
 */
export default async function CommunicatePage() {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  const [messagesOk, formsOk, workflowsOk, journeysOk, tasksOk] = await Promise.all([
    canMessages(organization.id, "message.view"),
    canForms(organization.id, "form.view"),
    canWorkflows(organization.id, "workflow.view"),
    canJourneys(organization.id, "journey.view"),
    canTasks(organization.id, "task.view"),
  ]);

  const [blasts, forms, workflows, journeys, tasks] = await Promise.all([
    messagesOk ? messageService.listEmailBlasts(organization.id, 5) : [],
    formsOk ? formService.listForms(organization.id) : [],
    workflowsOk ? workflowService.listWorkflows(organization.id) : [],
    journeysOk ? journeyService.listJourneys(organization.id) : [],
    tasksOk ? taskService.listTasks(organization.id, { take: 6 }) : [],
  ]);

  const publishedForms = forms.filter((f) => f.status === "PUBLISHED").length;

  // Role-aware creation tiles: only show what this viewer can actually do.
  const CREATE = [
    { label: "Send a message", desc: "Email your people — everyone, a filter, or a group.", href: "/messages/new", icon: <Mail size={18} />, show: messagesOk },
    { label: "Build a form", desc: "Plan-a-visit, sign-ups, prayer requests.", href: "/forms/new", icon: <ClipboardList size={18} />, show: formsOk },
    { label: "Create an automation", desc: "When something happens, CMS follows up for you.", href: "/workflows/new", icon: <Zap size={18} />, show: workflowsOk },
    { label: "Start a journey", desc: "Milestone pathways like new-member assimilation.", href: "/journeys/new", icon: <Map size={18} />, show: journeysOk },
  ].filter((c) => c.show);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Communicate" subtitle="Reach the right people at the right time." />

      {CREATE.length > 0 && (
        <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-section="communicate-create">
          {CREATE.map((c) => (
            <Link key={c.href} href={c.href} className="group block">
              <Card padding="md" interactive className="h-full">
                <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-surface-warm text-accent">
                  {c.icon}
                </span>
                <p className="flex items-center gap-1.5 text-[15px] font-semibold text-ink group-hover:text-accent">
                  <Plus size={14} className="text-ink-muted group-hover:text-accent" /> {c.label}
                </p>
                <p className="mt-1 text-sm text-ink-muted">{c.desc}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {messagesOk && (
          <Card padding="none" data-section="communicate-recent">
            <div className="flex items-center justify-between px-6 pb-1 pt-5">
              <h2 className="text-sm font-semibold text-ink">Recently sent</h2>
              <Link href="/messages" className="text-xs font-medium text-accent hover:text-accent-dark">
                All messages →
              </Link>
            </div>
            {blasts.length === 0 ? (
              <p className="px-6 pb-5 pt-2 text-sm text-ink-muted">Nothing sent yet — your first message is one click away.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {blasts.map((blast) => (
                  <li key={blast.id}>
                    <Link href={`/messages/blasts/${blast.id}`} className="flex items-center justify-between gap-3 px-6 py-3 hover:bg-surface-muted">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">{blast.subject}</span>
                        <span className="text-xs text-ink-muted">
                          {blast.sentCount} sent
                          {blast.failedCount > 0 ? ` · ${blast.failedCount} failed` : ""} · {timeAgo(blast.createdAt)}
                        </span>
                      </span>
                      {blast.failedCount > 0 && <Badge variant="warning">Check</Badge>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {tasksOk && (
          <Card padding="none" data-section="communicate-tasks">
            <div className="flex items-center justify-between px-6 pb-1 pt-5">
              <h2 className="text-sm font-semibold text-ink">Follow-up tasks</h2>
              <Link href="/tasks" className="text-xs font-medium text-accent hover:text-accent-dark">
                All tasks →
              </Link>
            </div>
            {tasks.length === 0 ? (
              <p className="px-6 pb-5 pt-2 text-sm text-ink-muted">Nothing open — follow-ups from automations land here.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {tasks.map((task) => (
                  <li key={task.id} className="flex items-center justify-between gap-3 px-6 py-3">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">
                        {task.title}
                        {task.workflowRunId && <Zap size={11} className="ml-1.5 inline text-accent" />}
                      </span>
                      <span className="text-xs text-ink-muted">
                        {task.relatedPerson ? `${personDisplayName(task.relatedPerson)} · ` : ""}
                        {task.dueAt ? (
                          <span className={isOverdue(task) ? "font-medium text-danger" : undefined}>
                            due {new Date(task.dueAt).toLocaleDateString()}
                          </span>
                        ) : (
                          "no due date"
                        )}
                      </span>
                    </span>
                    <CheckSquare size={15} className="shrink-0 text-ink-muted" />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {workflowsOk && (
          <Card padding="none" data-section="communicate-automations">
            <div className="flex items-center justify-between px-6 pb-1 pt-5">
              <h2 className="text-sm font-semibold text-ink">Automations</h2>
              <Link href="/workflows" className="text-xs font-medium text-accent hover:text-accent-dark">
                All automations →
              </Link>
            </div>
            {workflows.length === 0 ? (
              <p className="px-6 pb-5 pt-2 text-sm text-ink-muted">
                None yet — automations handle the follow-up you'd otherwise remember to do by hand.
              </p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {workflows.slice(0, 5).map((workflow) => (
                  <li key={workflow.id}>
                    <Link href={`/workflows/${workflow.id}`} className="flex items-center justify-between gap-3 px-6 py-3 hover:bg-surface-muted">
                      <span className="flex min-w-0 items-center gap-2">
                        <WorkflowIcon size={14} className="shrink-0 text-ink-muted" />
                        <span className="truncate font-medium text-ink">{workflow.name}</span>
                      </span>
                      <span className="shrink-0 text-xs text-ink-muted">{workflow._count.runs} runs</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {(formsOk || journeysOk) && (
          <Card padding="md" data-section="communicate-summary">
            <h2 className="mb-4 text-sm font-semibold text-ink">At a glance</h2>
            <div className="grid grid-cols-2 gap-6">
              {formsOk && (
                <Link href="/forms" className="group">
                  <p className="text-metric text-[28px] leading-none text-ink group-hover:text-accent">{publishedForms}</p>
                  <p className="mt-1.5 text-sm text-ink-secondary">
                    {publishedForms === 1 ? "form" : "forms"} live
                  </p>
                </Link>
              )}
              {journeysOk && (
                <Link href="/journeys" className="group">
                  <p className="text-metric text-[28px] leading-none text-ink group-hover:text-accent">{journeys.length}</p>
                  <p className="mt-1.5 text-sm text-ink-secondary">{journeys.length === 1 ? "journey" : "journeys"}</p>
                </Link>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
