import { taskPermissions, type TaskAction } from "@cms/database";
import { getCurrentOrgRole } from "./session";

/**
 * Server-side Tasks authorization, layered on the pure `can(role, action)` matrix in
 * @cms/database (BLUEPRINT §34). Workflow-created tasks are written by the worker
 * principal, not this path.
 */

export async function canTasks(organizationId: string, action: TaskAction): Promise<boolean> {
  const role = await getCurrentOrgRole(organizationId);
  return taskPermissions.can(role, action);
}

export async function requireTasks(organizationId: string, action: TaskAction): Promise<void> {
  if (!(await canTasks(organizationId, action))) {
    throw new Error("Not authorized to access Tasks for this organization");
  }
}
