"use server";

import { revalidatePath } from "next/cache";
import { auditService, taskService, type TaskPriority, type TaskStatus } from "@cms/database";
import { getCurrentOrganization, getCurrentUser } from "../../../lib/session";
import { requireTasks } from "../../../lib/tasks-access";

/**
 * Tasks server actions. Authorization enforced server-side via requireTasks (BLUEPRINT
 * §34); every mutation records an audit event (§47).
 */

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optionalStr(formData: FormData, key: string): string | null {
  const v = str(formData, key);
  return v.length > 0 ? v : null;
}

async function requireOrg() {
  const organization = await getCurrentOrganization();
  if (!organization) throw new Error("No organization");
  return organization;
}

async function audit(organizationId: string, action: string, taskId: string, metadata?: Record<string, unknown>) {
  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId,
    actorUserId: actor?.id,
    action,
    targetType: "Task",
    targetId: taskId,
    metadata,
  });
}

export async function createTaskAction(formData: FormData) {
  const organization = await requireOrg();
  await requireTasks(organization.id, "task.manage");

  const title = str(formData, "title");
  if (!title) throw new Error("Task title is required.");

  const dueRaw = str(formData, "dueAt");
  const actor = await getCurrentUser();
  const task = await taskService.createTask(organization.id, {
    title,
    description: optionalStr(formData, "description"),
    priority: (str(formData, "priority") || "NORMAL") as TaskPriority,
    dueAt: dueRaw ? new Date(`${dueRaw}T00:00:00Z`) : null,
    assigneeUserId: optionalStr(formData, "assigneeUserId"),
    relatedPersonId: optionalStr(formData, "relatedPersonId"),
    createdByUserId: actor?.id ?? null,
  });

  await audit(organization.id, "task.created", task.id, { title });
  revalidatePath("/tasks");
  if (task.relatedPersonId) revalidatePath(`/people/${task.relatedPersonId}`);
}

export async function setTaskStatusAction(taskId: string, status: TaskStatus, relatedPersonId: string | null) {
  const organization = await requireOrg();
  await requireTasks(organization.id, "task.manage");

  const changed = await taskService.setStatus(organization.id, taskId, status);
  if (changed) {
    const actionName =
      status === "COMPLETED"
        ? "task.completed"
        : status === "CANCELLED"
          ? "task.cancelled"
          : status === "OPEN"
            ? "task.reopened"
            : "task.updated";
    await audit(organization.id, actionName, taskId);
  }

  revalidatePath("/tasks");
  if (relatedPersonId) revalidatePath(`/people/${relatedPersonId}`);
}
