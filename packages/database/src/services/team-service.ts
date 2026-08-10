import { OrganizationRole } from "@prisma/client";
import { rawDb, tenantDb } from "../client";

export async function listMembers(organizationId: string) {
  return tenantDb.organizationMember.findMany({
    where: { organizationId },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function countOwners(organizationId: string) {
  return tenantDb.organizationMember.count({ where: { organizationId, role: "OWNER" } });
}

export async function countMembers(organizationId: string) {
  return tenantDb.organizationMember.count({ where: { organizationId } });
}

/**
 * Invites always resolve to a real, immediately-usable account (a random temp
 * password, emailed via EmailProvider by the caller) rather than a pending-invite
 * token -- there's no passwordless/magic-link flow in this app yet, and building one
 * just for invites would be a bigger feature than "add a teammate" calls for.
 * User is not organization-scoped at the model level (the row itself can outlive any
 * one org), but product-wise each account belongs to exactly one organization ever
 * (OrganizationMember.userId is @unique) -- so the membership check here
 * intentionally looks up by userId alone via rawDb, not scoped to this org, to catch
 * "already belongs to a different org" the same way as "already belongs to this one."
 */
export async function inviteMember(params: {
  organizationId: string;
  email: string;
  role: OrganizationRole;
  passwordHash: string;
}) {
  const email = params.email.toLowerCase();
  let user = await rawDb.user.findUnique({ where: { email } });
  const isNewUser = !user;
  if (!user) {
    user = await rawDb.user.create({ data: { email, passwordHash: params.passwordHash } });
  }

  const existingMembership = await rawDb.organizationMember.findUnique({ where: { userId: user.id } });
  if (existingMembership) {
    throw new Error(
      existingMembership.organizationId === params.organizationId
        ? "This person is already a member of your organization."
        : "This person already belongs to a different organization and can't be added to another one.",
    );
  }

  const member = await tenantDb.organizationMember.create({
    data: { organizationId: params.organizationId, userId: user.id, role: params.role },
  });

  return { user, member, isNewUser };
}

async function assertNotLastOwner(organizationId: string, userId: string) {
  const membership = await tenantDb.organizationMember.findFirst({ where: { organizationId, userId } });
  if (membership?.role !== "OWNER") return;
  const ownerCount = await countOwners(organizationId);
  if (ownerCount <= 1) throw new Error("An organization must have at least one owner.");
}

export async function updateMemberRole(organizationId: string, userId: string, role: OrganizationRole) {
  if (role !== "OWNER") await assertNotLastOwner(organizationId, userId);
  return tenantDb.organizationMember.updateMany({ where: { organizationId, userId }, data: { role } });
}

export async function removeMember(organizationId: string, userId: string) {
  await assertNotLastOwner(organizationId, userId);
  return tenantDb.organizationMember.deleteMany({ where: { organizationId, userId } });
}
