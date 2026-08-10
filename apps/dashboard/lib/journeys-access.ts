import { journeyPermissions, type JourneyAction } from "@cms/database";
import { getCurrentOrgRole } from "./session";

/**
 * Server-side Journeys authorization, layered on the pure `can(role, action)` matrix in
 * @cms/database (BLUEPRINT §34). Workflow-driven enrollment runs under the worker
 * principal, not this path.
 */

export async function canJourneys(organizationId: string, action: JourneyAction): Promise<boolean> {
  const role = await getCurrentOrgRole(organizationId);
  return journeyPermissions.can(role, action);
}

export async function requireJourneys(organizationId: string, action: JourneyAction): Promise<void> {
  if (!(await canJourneys(organizationId, action))) {
    throw new Error("Not authorized to access Journeys for this organization");
  }
}
