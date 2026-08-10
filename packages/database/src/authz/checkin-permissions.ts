import { OrganizationRole } from "@prisma/client";

/**
 * Authorization matrix for Check-In (BLUEPRINT §34). Attendance records are
 * Confidential/Restricted (§62 CheckIn), so v1 gates at Owner/Admin. Kiosk/station
 * principals arrive with the full Check-In phase.
 */
export type CheckinAction = "checkin.view" | "checkin.manage";

const CHECKIN_PERMISSIONS: Record<OrganizationRole, ReadonlySet<CheckinAction>> = {
  OWNER: new Set(["checkin.view", "checkin.manage"]),
  ADMIN: new Set(["checkin.view", "checkin.manage"]),
  CONTENT_MANAGER: new Set(),
  ANALYTICS_VIEWER: new Set(),
};

/** Whether a role may perform a Check-In action. Server-side authority. */
export function can(role: OrganizationRole | null | undefined, action: CheckinAction): boolean {
  if (!role) return false;
  return CHECKIN_PERMISSIONS[role]?.has(action) ?? false;
}
