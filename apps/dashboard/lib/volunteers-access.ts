import { volunteerPermissions, type VolunteerAction } from "@cms/database";
import { getCurrentOrgRole } from "./session";

/** Server-side Volunteers authorization (BLUEPRINT §34), layered on the pure matrix. */

export async function canVolunteers(organizationId: string, action: VolunteerAction): Promise<boolean> {
  const role = await getCurrentOrgRole(organizationId);
  return volunteerPermissions.can(role, action);
}

export async function requireVolunteers(organizationId: string, action: VolunteerAction): Promise<void> {
  if (!(await canVolunteers(organizationId, action))) {
    throw new Error("Not authorized to access Volunteers for this organization");
  }
}
