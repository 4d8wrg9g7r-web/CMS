import { OrganizationRole } from "@prisma/client";
import { rawDb, tenantDb } from "../client";

export async function createOrganizationWithOwner(params: {
  name: string;
  slug: string;
  ownerUserId: string;
}) {
  return tenantDb.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: { name: params.name, slug: params.slug },
    });
    await tx.organizationMember.create({
      data: {
        organizationId: organization.id,
        userId: params.ownerUserId,
        role: OrganizationRole.OWNER,
      },
    });
    return organization;
  });
}

/**
 * Resolve the org behind a public site id (/f/<id> forms, /e/<id> registration,
 * /c/<id> calendar, /g/<id> group finder). rawDb bootstrapping boundary: no tenant
 * context exists until this lookup provides it.
 */
export async function resolvePublicSite(publicSiteId: string) {
  const organization = await rawDb.organization.findUnique({ where: { publicSiteId } });
  if (!organization) return null;
  return { organizationId: organization.id, name: organization.name };
}

/**
 * Identity-resolution lookup: "which organizations does this user belong to."
 * This intentionally uses rawDb, not tenantDb — at this point in a request we do not
 * yet know the organizationId, because resolving it IS the point of this query. Every
 * subsequent query in the request must use the resolved organizationId via tenantDb.
 * This is the one narrow, documented exception to "always query through tenantDb."
 */
export async function getMembershipsForUser(userId: string) {
  return rawDb.organizationMember.findMany({
    where: { userId },
    include: { organization: true },
  });
}

export async function getMembership(organizationId: string, userId: string) {
  return tenantDb.organizationMember.findFirst({
    where: { organizationId, userId },
  });
}

export async function getOrganizationBySlug(slug: string) {
  // Organization itself is the tenant root, not tenant-owned — looking it up by
  // slug is how a request establishes which tenant it's operating in.
  return rawDb.organization.findUnique({ where: { slug } });
}

export async function getOrganization(organizationId: string) {
  return rawDb.organization.findUnique({ where: { id: organizationId } });
}

/**
 * Set the org's display timezone (UX audit #1). Organization is the tenant
 * root itself, so this goes through rawDb like the other org-level lookups;
 * callers gate on OWNER/ADMIN.
 */
export async function setOrganizationTimezone(organizationId: string, timezone: string) {
  return rawDb.organization.update({ where: { id: organizationId }, data: { timezone } });
}

/** Org display timezone for public surfaces that only hold an organizationId. */
export async function getOrganizationTimezone(organizationId: string): Promise<string> {
  const organization = await rawDb.organization.findUnique({
    where: { id: organizationId },
    select: { timezone: true },
  });
  return organization?.timezone ?? "UTC";
}
