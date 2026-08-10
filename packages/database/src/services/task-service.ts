import { Prisma, TaskPriority, TaskStatus } from "@prisma/client";
import { tenantDb } from "../client";

/**
 * Task service (BLUEPRINT §26/§40) — the universal work primitive. Tenant-scoped
 * throughout. Workflow-created tasks come through createTask with a workflowRunId so
 * provenance is preserved (§40); audit events are recorded by the callers (server
 * actions), matching the platform pattern.
 */

export interface TaskInput {
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  dueAt?: Date | null;
  assigneeUserId?: string | null;
  relatedPersonId?: string | null;
  workflowRunId?: string | null;
  createdByUserId?: string | null;
}

export interface ListTasksOptions {
  status?: TaskStatus;
  assigneeUserId?: string;
  relatedPersonId?: string;
  /** Include COMPLETED/CANCELLED (default false: only OPEN/IN_PROGRESS). */
  includeClosed?: boolean;
  skip?: number;
  take?: number;
}

function tasksWhere(organizationId: string, opts: ListTasksOptions): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = { organizationId };
  if (opts.status) {
    where.status = opts.status;
  } else if (!opts.includeClosed) {
    where.status = { in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS] };
  }
  if (opts.assigneeUserId) where.assigneeUserId = opts.assigneeUserId;
  if (opts.relatedPersonId) where.relatedPersonId = opts.relatedPersonId;
  return where;
}

const LIST_INCLUDE = {
  assignee: { select: { id: true, name: true, email: true } },
  relatedPerson: { select: { id: true, firstName: true, lastName: true, preferredName: true } },
} as const;

export async function listTasks(organizationId: string, opts: ListTasksOptions = {}) {
  return tenantDb.task.findMany({
    where: tasksWhere(organizationId, opts),
    // Due-soonest first with undated tasks last, then newest.
    orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    skip: opts.skip,
    take: opts.take,
    include: LIST_INCLUDE,
  });
}

export async function countTasks(organizationId: string, opts: ListTasksOptions = {}) {
  return tenantDb.task.count({ where: tasksWhere(organizationId, opts) });
}

export async function getTask(organizationId: string, taskId: string) {
  return tenantDb.task.findFirst({
    where: { id: taskId, organizationId },
    include: { ...LIST_INCLUDE, workflowRun: { select: { id: true, workflowId: true } } },
  });
}

/** Open follow-ups panel on the Person detail page. */
export async function listTasksForPerson(organizationId: string, personId: string) {
  return listTasks(organizationId, { relatedPersonId: personId, take: 20 });
}

export async function createTask(organizationId: string, input: TaskInput) {
  // A dangling assignee (not a member of this org) is silently unassigned rather than
  // failing -- matters for CREATE_TASK workflow steps whose configured assignee was
  // since removed (docs/domain/tasks.md failure modes).
  let assigneeUserId = input.assigneeUserId ?? null;
  if (assigneeUserId) {
    const membership = await tenantDb.organizationMember.findFirst({
      where: { organizationId, userId: assigneeUserId },
    });
    if (!membership) assigneeUserId = null;
  }

  return tenantDb.task.create({
    data: {
      organizationId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      priority: input.priority ?? TaskPriority.NORMAL,
      dueAt: input.dueAt ?? null,
      assigneeUserId,
      relatedPersonId: input.relatedPersonId ?? null,
      workflowRunId: input.workflowRunId ?? null,
      createdByUserId: input.createdByUserId ?? null,
    },
    include: LIST_INCLUDE,
  });
}

export async function updateTask(organizationId: string, taskId: string, input: Partial<TaskInput>) {
  const data: Prisma.TaskUncheckedUpdateManyInput = {};
  if (input.title !== undefined) data.title = input.title.trim();
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.priority !== undefined) data.priority = input.priority;
  if (input.dueAt !== undefined) data.dueAt = input.dueAt;
  if (input.assigneeUserId !== undefined) data.assigneeUserId = input.assigneeUserId;
  if (input.relatedPersonId !== undefined) data.relatedPersonId = input.relatedPersonId;

  const result = await tenantDb.task.updateMany({ where: { id: taskId, organizationId }, data });
  if (result.count === 0) return null;
  return getTask(organizationId, taskId);
}

/**
 * Guarded status transitions: complete/cancel act only on live tasks; reopen acts only on
 * closed ones. completedAt stamps on COMPLETED and clears otherwise.
 */
export async function setStatus(organizationId: string, taskId: string, status: TaskStatus) {
  const from: TaskStatus[] =
    status === TaskStatus.COMPLETED || status === TaskStatus.CANCELLED
      ? [TaskStatus.OPEN, TaskStatus.IN_PROGRESS]
      : [TaskStatus.COMPLETED, TaskStatus.CANCELLED, TaskStatus.OPEN, TaskStatus.IN_PROGRESS];

  const result = await tenantDb.task.updateMany({
    where: { id: taskId, organizationId, status: { in: from } },
    data: { status, completedAt: status === TaskStatus.COMPLETED ? new Date() : null },
  });
  return result.count > 0;
}
