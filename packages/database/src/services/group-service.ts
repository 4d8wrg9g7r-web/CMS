import { GroupEnrollment, GroupMembershipRole, GroupType, Prisma } from "@prisma/client";
import { tenantDb } from "../client";
import { hasCapacity } from "../groups/helpers";

/**
 * Groups service (BLUEPRINT §8). Tenant-scoped throughout. Memberships compose the
 * Person primitive -- addMember links an existing Person rather than copying contact
 * data. Soft archival (archivedAt) preserves history (BLUEPRINT §36). Callers (server
 * actions) record audit events.
 */

export interface GroupInput {
  name: string;
  type?: GroupType;
  description?: string | null;
  enrollment?: GroupEnrollment;
  meetingSchedule?: string | null;
  meetingLocation?: string | null;
  capacity?: number | null;
  isPublished?: boolean;
  campusId?: string | null;
}

export interface ListGroupsOptions {
  search?: string;
  type?: GroupType;
  campusId?: string;
  publishedOnly?: boolean;
  includeArchived?: boolean;
  skip?: number;
  take?: number;
}

function groupsWhere(organizationId: string, opts: ListGroupsOptions): Prisma.GroupWhereInput {
  const where: Prisma.GroupWhereInput = { organizationId };
  if (!opts.includeArchived) where.archivedAt = null;
  if (opts.type) where.type = opts.type;
  if (opts.campusId) where.campusId = opts.campusId;
  if (opts.publishedOnly) where.isPublished = true;
  const search = opts.search?.trim();
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }
  return where;
}

export async function listGroups(organizationId: string, opts: ListGroupsOptions = {}) {
  return tenantDb.group.findMany({
    where: groupsWhere(organizationId, opts),
    orderBy: { name: "asc" },
    skip: opts.skip,
    take: opts.take,
    include: {
      _count: { select: { memberships: true } },
      // Leaders surface on group cards; two names is plenty for a list row.
      memberships: {
        where: { role: GroupMembershipRole.LEADER },
        include: { person: { select: { firstName: true, lastName: true, preferredName: true } } },
        take: 2,
      },
    },
  });
}

export async function countGroups(organizationId: string, opts: ListGroupsOptions = {}) {
  return tenantDb.group.count({ where: groupsWhere(organizationId, opts) });
}

export async function getGroup(organizationId: string, groupId: string) {
  return tenantDb.group.findFirst({
    where: { id: groupId, organizationId },
    include: {
      campus: { select: { id: true, name: true } },
      // Leaders first, then co-leaders, then members (enum declaration order), each
      // group alphabetical by member name.
      memberships: {
        orderBy: [{ role: "asc" }, { person: { firstName: "asc" } }],
        include: { person: true },
      },
      _count: { select: { memberships: true } },
    },
  });
}

/** Groups a given person belongs to -- powers the Person detail "Groups" panel. */
export async function listGroupsForPerson(organizationId: string, personId: string) {
  return tenantDb.groupMembership.findMany({
    where: { organizationId, personId, group: { archivedAt: null } },
    include: { group: { select: { id: true, name: true, type: true } } },
    orderBy: { joinedAt: "desc" },
  });
}

export async function createGroup(organizationId: string, input: GroupInput) {
  return tenantDb.group.create({
    data: {
      organizationId,
      name: input.name.trim(),
      type: input.type ?? GroupType.SMALL_GROUP,
      description: input.description?.trim() || null,
      enrollment: input.enrollment ?? GroupEnrollment.OPEN,
      meetingSchedule: input.meetingSchedule?.trim() || null,
      meetingLocation: input.meetingLocation?.trim() || null,
      capacity: input.capacity ?? null,
      isPublished: input.isPublished ?? false,
      campusId: input.campusId ?? null,
    },
  });
}

export async function updateGroup(organizationId: string, groupId: string, input: Partial<GroupInput>) {
  const data: Prisma.GroupUncheckedUpdateManyInput = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.type !== undefined) data.type = input.type;
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.enrollment !== undefined) data.enrollment = input.enrollment;
  if (input.meetingSchedule !== undefined) data.meetingSchedule = input.meetingSchedule?.trim() || null;
  if (input.meetingLocation !== undefined) data.meetingLocation = input.meetingLocation?.trim() || null;
  if (input.capacity !== undefined) data.capacity = input.capacity;
  if (input.isPublished !== undefined) data.isPublished = input.isPublished;
  if (input.campusId !== undefined) data.campusId = input.campusId;

  const result = await tenantDb.group.updateMany({ where: { id: groupId, organizationId }, data });
  if (result.count === 0) return null;
  return getGroup(organizationId, groupId);
}

export async function archiveGroup(organizationId: string, groupId: string) {
  const result = await tenantDb.group.updateMany({
    where: { id: groupId, organizationId },
    data: { archivedAt: new Date() },
  });
  return result.count > 0;
}

export async function restoreGroup(organizationId: string, groupId: string) {
  const result = await tenantDb.group.updateMany({
    where: { id: groupId, organizationId },
    data: { archivedAt: null },
  });
  return result.count > 0;
}

// -- Membership ----------------------------------------------------------------

/**
 * Add a Person to a Group. Verifies both belong to this organization (no cross-tenant
 * links), enforces capacity, and is idempotent on the (groupId, personId) unique pair.
 * Returns { ok } or a reason so the caller can surface a friendly error.
 */
export async function addMember(
  organizationId: string,
  groupId: string,
  personId: string,
  role: GroupMembershipRole = GroupMembershipRole.MEMBER,
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "at_capacity" | "already_member" }> {
  const group = await tenantDb.group.findFirst({ where: { id: groupId, organizationId } });
  if (!group) return { ok: false, reason: "not_found" };

  const person = await tenantDb.person.findFirst({ where: { id: personId, organizationId } });
  if (!person) return { ok: false, reason: "not_found" };

  const existing = await tenantDb.groupMembership.findFirst({ where: { organizationId, groupId, personId } });
  if (existing) return { ok: false, reason: "already_member" };

  const currentCount = await tenantDb.groupMembership.count({ where: { organizationId, groupId } });
  if (!hasCapacity(currentCount, group.capacity)) return { ok: false, reason: "at_capacity" };

  await tenantDb.groupMembership.create({ data: { organizationId, groupId, personId, role } });
  return { ok: true };
}

export async function updateMemberRole(
  organizationId: string,
  groupId: string,
  personId: string,
  role: GroupMembershipRole,
) {
  const result = await tenantDb.groupMembership.updateMany({
    where: { organizationId, groupId, personId },
    data: { role },
  });
  return result.count > 0;
}

export async function removeMember(organizationId: string, groupId: string, personId: string) {
  const result = await tenantDb.groupMembership.deleteMany({ where: { organizationId, groupId, personId } });
  return result.count > 0;
}
