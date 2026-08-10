import { eventPermissions, type EventAction } from "@cms/database";
import { getCurrentOrgRole } from "./session";

/**
 * Server-side Events authorization (BLUEPRINT §34). Note the split matrix: Content
 * Managers manage event definitions but cannot view registrations (Confidential Person
 * links) — see authz/event-permissions.ts.
 */

export async function canEvents(organizationId: string, action: EventAction): Promise<boolean> {
  const role = await getCurrentOrgRole(organizationId);
  return eventPermissions.can(role, action);
}

export async function requireEvents(organizationId: string, action: EventAction): Promise<void> {
  if (!(await canEvents(organizationId, action))) {
    throw new Error("Not authorized to access Events for this organization");
  }
}
