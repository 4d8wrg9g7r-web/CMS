import { appPermissions, type AppAction } from "@cms/database";
import { getCurrentOrgRole } from "./session";

/**
 * Server-side church-app authorization (App Studio + sermons), layered on the pure
 * matrix in @cms/database. The public /a/<id> surface is a separate,
 * unauthenticated path scoped by publicAppId + enabled flag.
 */

export async function canApp(organizationId: string, action: AppAction): Promise<boolean> {
  const role = await getCurrentOrgRole(organizationId);
  return appPermissions.can(role, action);
}

export async function requireApp(organizationId: string, action: AppAction): Promise<void> {
  if (!(await canApp(organizationId, action))) {
    throw new Error("Not authorized to manage the church app for this organization");
  }
}
