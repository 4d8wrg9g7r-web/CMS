import { developerPermissions, type DeveloperAction } from "@cms/database";
import { getCurrentOrgRole } from "./session";

/** Server-side developer-platform authorization (BLUEPRINT §34 Platform Security domain). */

export async function canDeveloper(organizationId: string, action: DeveloperAction): Promise<boolean> {
  const role = await getCurrentOrgRole(organizationId);
  return developerPermissions.can(role, action);
}

export async function requireDeveloper(organizationId: string, action: DeveloperAction): Promise<void> {
  if (!(await canDeveloper(organizationId, action))) {
    throw new Error("Not authorized to manage API keys and webhooks for this organization");
  }
}
