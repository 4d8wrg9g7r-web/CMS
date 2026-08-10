import { OrganizationRole } from "@prisma/client";

/**
 * Authorization matrix for Check-In (BLUEPRINT §34). Per-person attendance records are
 * Confidential/Restricted (§62 CheckIn), so rosters (checkin.view) and mutations
 * (checkin.manage) gate at Owner/Admin. attendance.view covers AGGREGATES ONLY (counts,
 * trends, averages — never names) and is the one check-in action ANALYTICS_VIEWER
 * holds; see docs/domain/attendance.md for the boundary. Kiosk/station principals
 * arrive with the full Check-In phase.
 */
export type CheckinAction = "checkin.view" | "checkin.manage" | "attendance.view";

const CHECKIN_PERMISSIONS: Record<OrganizationRole, ReadonlySet<CheckinAction>> = {
  OWNER: new Set(["checkin.view", "checkin.manage", "attendance.view"]),
  ADMIN: new Set(["checkin.view", "checkin.manage", "attendance.view"]),
  CONTENT_MANAGER: new Set(),
  ANALYTICS_VIEWER: new Set(["attendance.view"]),
};

/** Whether a role may perform a Check-In action. Server-side authority. */
export function can(role: OrganizationRole | null | undefined, action: CheckinAction): boolean {
  if (!role) return false;
  return CHECKIN_PERMISSIONS[role]?.has(action) ?? false;
}
