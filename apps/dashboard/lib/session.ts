import type { OrganizationRole } from "@cms/database";
import { organizationService } from "@cms/database";
import { auth } from "../auth";

/**
 * The only place in the app that calls NextAuth's auth() directly. Every route,
 * server action, and page reads the current user/role through these helpers instead,
 * so swapping the auth provider later (Clerk, OAuth) never touches call sites
 * (build-plan decision).
 */
export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return { id: session.user.id, email: session.user.email ?? "", name: session.user.name ?? null };
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}

/** Milestone-1 UX: a user belongs to exactly one organization (created at onboarding). */
export async function getCurrentOrganization() {
  const user = await getCurrentUser();
  if (!user) return null;
  const memberships = await organizationService.getMembershipsForUser(user.id);
  return memberships[0]?.organization ?? null;
}

export async function getCurrentOrgRole(organizationId: string): Promise<OrganizationRole | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const membership = await organizationService.getMembership(organizationId, user.id);
  return membership?.role ?? null;
}

export async function requireOrgRole(organizationId: string, allowed: OrganizationRole[]) {
  const role = await getCurrentOrgRole(organizationId);
  if (!role || !allowed.includes(role)) throw new Error("Not authorized for this organization");
  return role;
}
