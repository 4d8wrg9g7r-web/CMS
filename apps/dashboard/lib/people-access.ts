import { peoplePermissions, type PeopleAction } from "@cms/database";
import { getCurrentOrgRole } from "./session";

/**
 * Server-side People/Households authorization, layered on the pure `can(role, action)`
 * matrix in @cms/database (unit-tested there). Every People page and server action
 * calls one of these before reading or mutating -- authorization is enforced at the
 * server, never by hiding UI (BLUEPRINT §34 "Claude rule").
 */

export async function canPeople(organizationId: string, action: PeopleAction): Promise<boolean> {
  const role = await getCurrentOrgRole(organizationId);
  return peoplePermissions.can(role, action);
}

export async function requirePeople(organizationId: string, action: PeopleAction): Promise<void> {
  if (!(await canPeople(organizationId, action))) {
    throw new Error("Not authorized to access People for this organization");
  }
}
