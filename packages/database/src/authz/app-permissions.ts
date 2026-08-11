import { OrganizationRole } from "@prisma/client";

/**
 * Authorization matrix for the church-app domain (docs/domain/app.md): App Studio
 * design + the sermon library. This is public-facing content (no Confidential
 * person data), so CONTENT_MANAGER can manage it — same posture as Events. The
 * public /a/<id> surface is a separate unauthenticated path scoped by publicAppId
 * and gated on the app's enabled flag; it does not go through this matrix.
 */
export type AppAction = "app.view" | "app.manage" | "sermon.view" | "sermon.manage";

const APP_PERMISSIONS: Record<OrganizationRole, ReadonlySet<AppAction>> = {
  OWNER: new Set(["app.view", "app.manage", "sermon.view", "sermon.manage"]),
  ADMIN: new Set(["app.view", "app.manage", "sermon.view", "sermon.manage"]),
  CONTENT_MANAGER: new Set(["app.view", "app.manage", "sermon.view", "sermon.manage"]),
  ANALYTICS_VIEWER: new Set(["app.view", "sermon.view"]),
};

/** Whether a role may perform a church-app action. Server-side authority. */
export function can(role: OrganizationRole | null | undefined, action: AppAction): boolean {
  if (!role) return false;
  return APP_PERMISSIONS[role]?.has(action) ?? false;
}
