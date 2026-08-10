import { OrganizationRole } from "@prisma/client";

/**
 * Authorization matrix for Volunteers (BLUEPRINT §34). Assignments and qualifications
 * are Confidential person data (and qualification names can imply sensitive facts), so
 * v1 gates at Owner/Admin. Team-leader self-service arrives with richer roles.
 */
export type VolunteerAction = "volunteer.view" | "volunteer.manage";

const VOLUNTEER_PERMISSIONS: Record<OrganizationRole, ReadonlySet<VolunteerAction>> = {
  OWNER: new Set(["volunteer.view", "volunteer.manage"]),
  ADMIN: new Set(["volunteer.view", "volunteer.manage"]),
  CONTENT_MANAGER: new Set(),
  ANALYTICS_VIEWER: new Set(),
};

/** Whether a role may perform a Volunteers action. Server-side authority. */
export function can(role: OrganizationRole | null | undefined, action: VolunteerAction): boolean {
  if (!role) return false;
  return VOLUNTEER_PERMISSIONS[role]?.has(action) ?? false;
}
