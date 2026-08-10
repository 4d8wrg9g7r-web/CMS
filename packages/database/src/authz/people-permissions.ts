import { OrganizationRole } from "@prisma/client";

/**
 * Authorization matrix for the People & Households domain (BLUEPRINT §34 "what action?
 * on which data scope?"). This is the pure, unit-tested core of `can(user, action,
 * resource, context)` for people: it answers "what action?" from the caller's role.
 * Tenant scope ("which data?") is enforced independently by the tenant guard, which
 * refuses any Person/Household query without an organizationId.
 *
 * Person contact and household data is classified Confidential (BLUEPRINT §63) and is a
 * distinct security domain from content management -- so CONTENT_MANAGER,
 * and ANALYTICS_VIEWER get no access. Kept deliberately small and
 * declarative so the negative cases are obvious and testable.
 */
export type PeopleAction =
  | "person.view"
  | "person.manage"
  | "person.import"
  | "household.view"
  | "household.manage";

const PEOPLE_PERMISSIONS: Record<OrganizationRole, ReadonlySet<PeopleAction>> = {
  OWNER: new Set(["person.view", "person.manage", "person.import", "household.view", "household.manage"]),
  ADMIN: new Set(["person.view", "person.manage", "person.import", "household.view", "household.manage"]),
  CONTENT_MANAGER: new Set(),
  ANALYTICS_VIEWER: new Set(),
};

/** Whether a role may perform a People/Households action. Server-side authority. */
export function can(role: OrganizationRole | null | undefined, action: PeopleAction): boolean {
  if (!role) return false;
  return PEOPLE_PERMISSIONS[role]?.has(action) ?? false;
}
