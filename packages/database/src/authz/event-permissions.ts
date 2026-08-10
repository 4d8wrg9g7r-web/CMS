import { OrganizationRole } from "@prisma/client";

/**
 * Authorization matrix for Events (BLUEPRINT §34). The platform's first deliberately
 * non-uniform matrix: event DEFINITIONS are Public/Internal content (§62), so Content
 * Managers may manage them — but REGISTRATIONS link Confidential Person records, so
 * viewing them stays Owner/Admin. "What action, on which data" in practice.
 */
export type EventAction = "event.view" | "event.manage" | "event.registrations.view";

const EVENT_PERMISSIONS: Record<OrganizationRole, ReadonlySet<EventAction>> = {
  OWNER: new Set(["event.view", "event.manage", "event.registrations.view"]),
  ADMIN: new Set(["event.view", "event.manage", "event.registrations.view"]),
  CONTENT_MANAGER: new Set(["event.view", "event.manage"]),
  ANALYTICS_VIEWER: new Set(),
};

/** Whether a role may perform an Events action. Server-side authority. */
export function can(role: OrganizationRole | null | undefined, action: EventAction): boolean {
  if (!role) return false;
  return EVENT_PERMISSIONS[role]?.has(action) ?? false;
}
