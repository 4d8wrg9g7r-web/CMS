import { OrganizationRole } from "@prisma/client";

/**
 * Authorization matrix for Files (BLUEPRINT §34/§41). Files inherit related-entity
 * sensitivity; v1 relations are Person-only (Confidential), so Owner/Admin. Enforced on
 * upload, listing, archive, AND the download route on every request — object URLs are
 * never authorization.
 */
export type FileAction = "file.view" | "file.manage";

const FILE_PERMISSIONS: Record<OrganizationRole, ReadonlySet<FileAction>> = {
  OWNER: new Set(["file.view", "file.manage"]),
  ADMIN: new Set(["file.view", "file.manage"]),
  CONTENT_MANAGER: new Set(),
  ANALYTICS_VIEWER: new Set(),
};

/** Whether a role may perform a Files action. Server-side authority. */
export function can(role: OrganizationRole | null | undefined, action: FileAction): boolean {
  if (!role) return false;
  return FILE_PERMISSIONS[role]?.has(action) ?? false;
}
