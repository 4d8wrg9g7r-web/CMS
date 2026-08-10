import { groupPermissions, type GroupAction } from "@cms/database";
import { getCurrentOrgRole } from "./session";

/**
 * Server-side Groups authorization, layered on the pure `can(role, action)` matrix in
 * @cms/database. Every Groups page and action calls one of these before reading or
 * mutating -- never authorization-by-UI (BLUEPRINT §34).
 */

export async function canGroups(organizationId: string, action: GroupAction): Promise<boolean> {
  const role = await getCurrentOrgRole(organizationId);
  return groupPermissions.can(role, action);
}

export async function requireGroups(organizationId: string, action: GroupAction): Promise<void> {
  if (!(await canGroups(organizationId, action))) {
    throw new Error("Not authorized to access Groups for this organization");
  }
}
