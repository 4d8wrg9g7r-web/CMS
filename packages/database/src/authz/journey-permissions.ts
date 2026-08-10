import { OrganizationRole } from "@prisma/client";

/**
 * Authorization matrix for Journeys (BLUEPRINT §34). Enrollments and progress reveal
 * Confidential Person data (who is on which discipleship path), so v1 gates at
 * Owner/Admin like the other Person-referencing modules.
 */
export type JourneyAction = "journey.view" | "journey.manage";

const JOURNEY_PERMISSIONS: Record<OrganizationRole, ReadonlySet<JourneyAction>> = {
  OWNER: new Set(["journey.view", "journey.manage"]),
  ADMIN: new Set(["journey.view", "journey.manage"]),
  CONTENT_MANAGER: new Set(),
  ANALYTICS_VIEWER: new Set(),
};

/** Whether a role may perform a Journeys action. Server-side authority. */
export function can(role: OrganizationRole | null | undefined, action: JourneyAction): boolean {
  if (!role) return false;
  return JOURNEY_PERMISSIONS[role]?.has(action) ?? false;
}
