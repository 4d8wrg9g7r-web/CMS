import { OrganizationRole } from "@prisma/client";

/**
 * Authorization matrix for Giving (docs/domain/giving.md). Financial records are
 * the most sensitive data the platform holds (BLUEPRINT §63 Confidential+): only
 * OWNER/ADMIN see or touch them. CONTENT_MANAGER and ANALYTICS_VIEWER get nothing —
 * including aggregates, which still leak donor behavior.
 */
export type GivingAction =
  | "giving.view"
  | "giving.record"
  | "giving.manage_funds"
  | "giving.statements";

const GIVING_PERMISSIONS: Record<OrganizationRole, ReadonlySet<GivingAction>> = {
  OWNER: new Set(["giving.view", "giving.record", "giving.manage_funds", "giving.statements"]),
  ADMIN: new Set(["giving.view", "giving.record", "giving.manage_funds", "giving.statements"]),
  CONTENT_MANAGER: new Set(),
  ANALYTICS_VIEWER: new Set(),
};

/** Whether a role may perform a Giving action. Server-side authority. */
export function can(role: OrganizationRole | null | undefined, action: GivingAction): boolean {
  if (!role) return false;
  return GIVING_PERMISSIONS[role]?.has(action) ?? false;
}
