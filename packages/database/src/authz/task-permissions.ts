import { OrganizationRole } from "@prisma/client";

/**
 * Authorization matrix for Tasks (BLUEPRINT §34/§40). Tasks routinely reference
 * Confidential Person records, and §40 says task permissions inherit related-entity
 * sensitivity — so v1 gates at Owner/Admin, the same posture as People. Finer-grained
 * assignee-only visibility is a documented deferral (docs/domain/tasks.md).
 */
export type TaskAction = "task.view" | "task.manage";

const TASK_PERMISSIONS: Record<OrganizationRole, ReadonlySet<TaskAction>> = {
  OWNER: new Set(["task.view", "task.manage"]),
  ADMIN: new Set(["task.view", "task.manage"]),
  CONTENT_MANAGER: new Set(),
  ANALYTICS_VIEWER: new Set(),
};

/** Whether a role may perform a Tasks action. Server-side authority. */
export function can(role: OrganizationRole | null | undefined, action: TaskAction): boolean {
  if (!role) return false;
  return TASK_PERMISSIONS[role]?.has(action) ?? false;
}
