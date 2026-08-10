import { checkinPermissions, type CheckinAction } from "@cms/database";
import { getCurrentOrgRole } from "./session";

/** Server-side Check-In authorization (BLUEPRINT §34), layered on the pure matrix. */

export async function canCheckin(organizationId: string, action: CheckinAction): Promise<boolean> {
  const role = await getCurrentOrgRole(organizationId);
  return checkinPermissions.can(role, action);
}

export async function requireCheckin(organizationId: string, action: CheckinAction): Promise<void> {
  if (!(await canCheckin(organizationId, action))) {
    throw new Error("Not authorized to access Check-In for this organization");
  }
}
