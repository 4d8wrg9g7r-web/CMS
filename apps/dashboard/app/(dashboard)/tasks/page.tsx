import Link from "next/link";
import { CheckSquare, Lock, Plus, RotateCcw, Undo2, X, Zap } from "lucide-react";
import {
  isOverdue,
  peopleService,
  personDisplayName,
  taskService,
  teamService,
  type TaskStatus,
} from "@cms/database";
import { Badge } from "../../../components/ui/Badge";
import { buttonClasses } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Input, Select, Textarea } from "../../../components/ui/Input";
import {
  TASK_PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
  taskPriorityLabel,
  taskPriorityTone,
  taskStatusLabel,
  taskStatusTone,
} from "../../../lib/tasks-format";
import { canTasks } from "../../../lib/tasks-access";
import { getCurrentOrganization, getCurrentUser } from "../../../lib/session";
import { createTaskAction, setTaskStatusAction } from "./actions";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; assignee?: string; person?: string }>;
}) {
  const organization = await getCurrentOrganization();
  const user = await getCurrentUser();
  if (!organization || !user) return null;

  const [canView, canManage] = await Promise.all([
    canTasks(organization.id, "task.view"),
    canTasks(organization.id, "task.manage"),
  ]);

  if (!canView) {
    return (
      <div>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-ink">Tasks</h1>
        <Card padding="md" className="mt-6">
          <EmptyState
            icon={<Lock size={22} />}
            title="You don't have access to Tasks"
            description="Tasks are restricted to organization owners and admins."
          />
        </Card>
      </div>
    );
  }

  const params = await searchParams;
  const statusFilter = (params.status as TaskStatus | undefined) || undefined;
  const mineOnly = params.assignee === "me";
  const personFilter = params.person || undefined;

  const [tasks, members, people] = await Promise.all([
    taskService.listTasks(organization.id, {
      status: statusFilter,
      assigneeUserId: mineOnly ? user.id : undefined,
      relatedPersonId: personFilter,
      includeClosed: !!statusFilter,
      take: 100,
    }),
    teamService.listMembers(organization.id),
    peopleService.listPeople(organization.id, { take: 200 }),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-ink">Tasks</h1>
        <p className="text-sm text-ink-secondary">
          Follow-up and operational work — created by staff or by workflows.
        </p>
      </div>

      {canManage && (
        <Card padding="md" className="mb-6">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
            <Plus size={15} /> New task
          </h2>
          <form action={createTaskAction} className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-ink-secondary sm:col-span-2">
              Title <span className="text-danger">*</span>
              <Input name="title" required placeholder="Call the Nguyen family about Sunday" className="mt-1" />
            </label>
            <label className="text-sm text-ink-secondary sm:col-span-2">
              Details
              <Textarea name="description" rows={2} className="mt-1" />
            </label>
            <label className="text-sm text-ink-secondary">
              Priority
              <Select name="priority" defaultValue="NORMAL" className="mt-1">
                {TASK_PRIORITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-sm text-ink-secondary">
              Due date
              <Input name="dueAt" type="date" className="mt-1" />
            </label>
            <label className="text-sm text-ink-secondary">
              Assignee
              <Select name="assigneeUserId" defaultValue="" className="mt-1">
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.user.name || m.user.email}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-sm text-ink-secondary">
              Related person
              <Select name="relatedPersonId" defaultValue={personFilter ?? ""} className="mt-1">
                <option value="">None</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {personDisplayName(p)}
                  </option>
                ))}
              </Select>
            </label>
            <div className="sm:col-span-2">
              <button type="submit" className={buttonClasses("primary", "md")}>
                Create task
              </button>
            </div>
          </form>
        </Card>
      )}

      <Card padding="sm" className="mb-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-ink-secondary">
            Status
            <Select name="status" defaultValue={statusFilter ?? ""} className="mt-1 w-44">
              <option value="">Open + in progress</option>
              {TASK_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-sm text-ink-secondary">
            Assignee
            <Select name="assignee" defaultValue={mineOnly ? "me" : ""} className="mt-1 w-40">
              <option value="">Anyone</option>
              <option value="me">Assigned to me</option>
            </Select>
          </label>
          <button type="submit" className={buttonClasses("secondary", "md")}>
            Apply
          </button>
        </form>
      </Card>

      {tasks.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<CheckSquare size={22} />}
            title={statusFilter || mineOnly || personFilter ? "No tasks match your filters" : "No open tasks"}
            description={
              statusFilter || mineOnly || personFilter
                ? "Try different filters."
                : "Create a task above, or let a workflow create them for you."
            }
          />
        </Card>
      ) : (
        <Card padding="none">
          <ul className="divide-y divide-border">
            {tasks.map((task) => {
              const overdue = isOverdue(task);
              const live = task.status === "OPEN" || task.status === "IN_PROGRESS";
              return (
                <li key={task.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${task.status === "COMPLETED" ? "text-ink-muted line-through" : "text-ink"}`}>
                      {task.title}
                      {task.workflowRunId && (
                        <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-accent-dark">
                          <Zap size={11} /> automated
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-muted">
                      {task.dueAt && (
                        <span className={overdue ? "font-medium text-danger" : undefined}>
                          Due {new Date(task.dueAt).toLocaleDateString()}
                          {overdue ? " · overdue" : ""}
                        </span>
                      )}
                      {task.assignee && <span>{task.assignee.name || task.assignee.email}</span>}
                      {task.relatedPerson && (
                        <Link href={`/people/${task.relatedPerson.id}`} className="hover:text-accent">
                          {personDisplayName(task.relatedPerson)}
                        </Link>
                      )}
                    </p>
                  </div>
                  <Badge variant={taskPriorityTone(task.priority)}>{taskPriorityLabel(task.priority)}</Badge>
                  <Badge variant={taskStatusTone(task.status)}>{taskStatusLabel(task.status)}</Badge>
                  {canManage && (
                    <div className="flex items-center gap-1.5">
                      {live ? (
                        <>
                          <form action={setTaskStatusAction.bind(null, task.id, "COMPLETED", task.relatedPersonId)}>
                            <button type="submit" className={buttonClasses("secondary", "sm")} aria-label="Complete task">
                              <CheckSquare size={14} /> Done
                            </button>
                          </form>
                          <form action={setTaskStatusAction.bind(null, task.id, "CANCELLED", task.relatedPersonId)}>
                            <button
                              type="submit"
                              aria-label="Cancel task"
                              className="rounded-sm p-1.5 text-ink-muted hover:bg-surface-muted hover:text-danger"
                            >
                              <X size={15} />
                            </button>
                          </form>
                        </>
                      ) : (
                        <form action={setTaskStatusAction.bind(null, task.id, "OPEN", task.relatedPersonId)}>
                          <button type="submit" className={buttonClasses("ghost", "sm")} aria-label="Reopen task">
                            {task.status === "COMPLETED" ? <Undo2 size={14} /> : <RotateCcw size={14} />} Reopen
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
