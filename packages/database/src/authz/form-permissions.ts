import { OrganizationRole } from "@prisma/client";

/**
 * Authorization matrix for the Forms domain (BLUEPRINT §34). Submissions can carry
 * Confidential Person data, so building forms and reading submissions is gated at
 * Owner/Admin. Public submission is a separate, unauthenticated path scoped by the form's
 * publicId and rate-limited -- it does not go through this matrix.
 */
export type FormAction = "form.view" | "form.manage";

const FORM_PERMISSIONS: Record<OrganizationRole, ReadonlySet<FormAction>> = {
  OWNER: new Set(["form.view", "form.manage"]),
  ADMIN: new Set(["form.view", "form.manage"]),
  CONTENT_MANAGER: new Set(),
  ANALYTICS_VIEWER: new Set(),
};

/** Whether a role may perform a Forms action. Server-side authority. */
export function can(role: OrganizationRole | null | undefined, action: FormAction): boolean {
  if (!role) return false;
  return FORM_PERMISSIONS[role]?.has(action) ?? false;
}
