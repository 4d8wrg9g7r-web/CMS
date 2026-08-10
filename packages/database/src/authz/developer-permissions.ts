import { OrganizationRole } from "@prisma/client";

/**
 * Authorization matrix for the developer platform (BLUEPRINT §34 "Platform Security"
 * domain: roles, API keys → org admin/security admin). Owner/Admin only.
 */
export type DeveloperAction = "api.manage";

const DEVELOPER_PERMISSIONS: Record<OrganizationRole, ReadonlySet<DeveloperAction>> = {
  OWNER: new Set(["api.manage"]),
  ADMIN: new Set(["api.manage"]),
  CONTENT_MANAGER: new Set(),
  ANALYTICS_VIEWER: new Set(),
};

/** Whether a role may manage API keys / webhooks. Server-side authority. */
export function can(role: OrganizationRole | null | undefined, action: DeveloperAction): boolean {
  if (!role) return false;
  return DEVELOPER_PERMISSIONS[role]?.has(action) ?? false;
}
