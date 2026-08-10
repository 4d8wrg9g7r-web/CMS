import { givingPermissions, type GivingAction } from "@cms/database";
import { getCurrentOrgRole } from "./session";

/**
 * Server-side Giving authorization, layered on the pure `can(role, action)` matrix
 * in @cms/database (unit-tested there). Financial records are Confidential+ —
 * OWNER/ADMIN only; every Giving page and action calls one of these first.
 */

export async function canGiving(organizationId: string, action: GivingAction): Promise<boolean> {
  const role = await getCurrentOrgRole(organizationId);
  return givingPermissions.can(role, action);
}

export async function requireGiving(organizationId: string, action: GivingAction): Promise<void> {
  if (!(await canGiving(organizationId, action))) {
    throw new Error("Not authorized to access Giving for this organization");
  }
}
