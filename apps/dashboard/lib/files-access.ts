import { filePermissions, type FileAction } from "@cms/database";
import { getCurrentOrgRole } from "./session";

/** Server-side Files authorization (BLUEPRINT §34/§41), layered on the pure matrix. */

export async function canFiles(organizationId: string, action: FileAction): Promise<boolean> {
  const role = await getCurrentOrgRole(organizationId);
  return filePermissions.can(role, action);
}

export async function requireFiles(organizationId: string, action: FileAction): Promise<void> {
  if (!(await canFiles(organizationId, action))) {
    throw new Error("Not authorized to access Files for this organization");
  }
}
