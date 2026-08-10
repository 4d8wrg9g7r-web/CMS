import { OrganizationRole } from "@prisma/client";

/**
 * Authorization matrix for the Workflow engine (BLUEPRINT §34). Workflows send email and
 * mutate People/Groups records automatically, so building, publishing, and inspecting
 * runs is gated at Owner/Admin. Run execution itself happens under the system/worker
 * principal with the triggering event's organization context.
 */
export type WorkflowAction = "workflow.view" | "workflow.manage";

const WORKFLOW_PERMISSIONS: Record<OrganizationRole, ReadonlySet<WorkflowAction>> = {
  OWNER: new Set(["workflow.view", "workflow.manage"]),
  ADMIN: new Set(["workflow.view", "workflow.manage"]),
  CONTENT_MANAGER: new Set(),
  ANALYTICS_VIEWER: new Set(),
};

/** Whether a role may perform a Workflow action. Server-side authority. */
export function can(role: OrganizationRole | null | undefined, action: WorkflowAction): boolean {
  if (!role) return false;
  return WORKFLOW_PERMISSIONS[role]?.has(action) ?? false;
}
