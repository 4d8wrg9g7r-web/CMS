import { formPermissions, type FormAction } from "@cms/database";
import { getCurrentOrgRole } from "./session";

/**
 * Server-side Forms authorization, layered on the pure `can(role, action)` matrix in
 * @cms/database. Every staff Forms page and action calls one of these first -- public
 * submission is a separate, unauthenticated path scoped by publicId (BLUEPRINT §34).
 */

export async function canForms(organizationId: string, action: FormAction): Promise<boolean> {
  const role = await getCurrentOrgRole(organizationId);
  return formPermissions.can(role, action);
}

export async function requireForms(organizationId: string, action: FormAction): Promise<void> {
  if (!(await canForms(organizationId, action))) {
    throw new Error("Not authorized to access Forms for this organization");
  }
}
