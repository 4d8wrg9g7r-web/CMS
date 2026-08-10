import { OrganizationRole } from "@prisma/client";

/**
 * Authorization matrix for the Groups domain (BLUEPRINT §34). Group definitions are
 * Internal, but membership rows link to Confidential Person records -- viewing a group
 * reveals who belongs to it -- so v1 gates Groups at Owner/Admin, the same posture as
 * People. Tenant scope is enforced independently by the tenant guard.
 */
export type GroupAction = "group.view" | "group.manage";

const GROUP_PERMISSIONS: Record<OrganizationRole, ReadonlySet<GroupAction>> = {
  OWNER: new Set(["group.view", "group.manage"]),
  ADMIN: new Set(["group.view", "group.manage"]),
  CONTENT_MANAGER: new Set(),
  ANALYTICS_VIEWER: new Set(),
};

/** Whether a role may perform a Groups action. Server-side authority. */
export function can(role: OrganizationRole | null | undefined, action: GroupAction): boolean {
  if (!role) return false;
  return GROUP_PERMISSIONS[role]?.has(action) ?? false;
}
