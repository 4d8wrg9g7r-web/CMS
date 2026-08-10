import { OrganizationRole } from "@prisma/client";

/**
 * Authorization matrix for the Communications log (BLUEPRINT §34). Message contents and
 * recipients are Confidential (§62), so viewing/resending is Owner/Admin. Sending itself
 * happens through feature paths (workflows, forms) or the worker principal.
 */
export type MessageAction = "message.view" | "message.manage";

const MESSAGE_PERMISSIONS: Record<OrganizationRole, ReadonlySet<MessageAction>> = {
  OWNER: new Set(["message.view", "message.manage"]),
  ADMIN: new Set(["message.view", "message.manage"]),
  CONTENT_MANAGER: new Set(),
  ANALYTICS_VIEWER: new Set(),
};

/** Whether a role may perform a Communications action. Server-side authority. */
export function can(role: OrganizationRole | null | undefined, action: MessageAction): boolean {
  if (!role) return false;
  return MESSAGE_PERMISSIONS[role]?.has(action) ?? false;
}
