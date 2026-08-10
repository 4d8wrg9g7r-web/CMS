import { workflowPermissions, type WorkflowAction } from "@cms/database";
import { getCurrentOrgRole } from "./session";

/**
 * Server-side Workflows authorization, layered on the pure `can(role, action)` matrix in
 * @cms/database. Every Workflows page and action calls one of these first (BLUEPRINT
 * §34); run execution happens under the worker principal, not this path.
 */

export async function canWorkflows(organizationId: string, action: WorkflowAction): Promise<boolean> {
  const role = await getCurrentOrgRole(organizationId);
  return workflowPermissions.can(role, action);
}

export async function requireWorkflows(organizationId: string, action: WorkflowAction): Promise<void> {
  if (!(await canWorkflows(organizationId, action))) {
    throw new Error("Not authorized to access Workflows for this organization");
  }
}
