import { Prisma, ServingAssignmentStatus } from "@prisma/client";
import { tenantDb } from "../client";

/**
 * Volunteers service (BLUEPRINT §10). Tenant-scoped throughout. Deactivation preserves
 * serving history; qualifications are staff-recorded named credentials with optional
 * expiry (background-check handling deliberately absent — see docs/domain/volunteers.md).
 * Audit events are recorded by callers.
 */

// -- Teams & positions ---------------------------------------------------------

export async function listTeams(organizationId: string, opts: { includeArchived?: boolean } = {}) {
  return tenantDb.servingTeam.findMany({
    where: { organizationId, ...(opts.includeArchived ? {} : { archivedAt: null }) },
    orderBy: { name: "asc" },
    include: {
      positions: {
        select: { id: true, _count: { select: { assignments: { where: { status: ServingAssignmentStatus.ACTIVE } } } } },
      },
    },
  });
}

export async function getTeam(organizationId: string, teamId: string) {
  return tenantDb.servingTeam.findFirst({
    where: { id: teamId, organizationId },
    include: {
      positions: {
        orderBy: { name: "asc" },
        include: {
          assignments: {
            orderBy: { startedAt: "asc" },
            include: {
              person: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  preferredName: true,
                  qualifications: { select: { name: true, expiresAt: true } },
                },
              },
            },
          },
        },
      },
    },
  });
}

export async function createTeam(
  organizationId: string,
  input: { name: string; description?: string | null; campusId?: string | null },
) {
  return tenantDb.servingTeam.create({
    data: {
      organizationId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      campusId: input.campusId ?? null,
    },
  });
}

export async function updateTeam(
  organizationId: string,
  teamId: string,
  input: Partial<{ name: string; description: string | null }>,
) {
  const data: Prisma.ServingTeamUncheckedUpdateManyInput = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  const result = await tenantDb.servingTeam.updateMany({ where: { id: teamId, organizationId }, data });
  return result.count > 0;
}

export async function archiveTeam(organizationId: string, teamId: string) {
  const result = await tenantDb.servingTeam.updateMany({
    where: { id: teamId, organizationId },
    data: { archivedAt: new Date() },
  });
  return result.count > 0;
}

export async function restoreTeam(organizationId: string, teamId: string) {
  const result = await tenantDb.servingTeam.updateMany({
    where: { id: teamId, organizationId },
    data: { archivedAt: null },
  });
  return result.count > 0;
}

export async function addPosition(
  organizationId: string,
  teamId: string,
  input: { name: string; requiredQualifications?: string[] },
) {
  const team = await tenantDb.servingTeam.findFirst({ where: { id: teamId, organizationId } });
  if (!team) throw new Error("Team not found.");
  return tenantDb.servingPosition.create({
    data: {
      organizationId,
      teamId,
      name: input.name.trim(),
      requiredQualifications: (input.requiredQualifications ?? []).map((q) => q.trim()).filter(Boolean),
    },
  });
}

export async function updatePosition(
  organizationId: string,
  positionId: string,
  input: Partial<{ name: string; requiredQualifications: string[] }>,
) {
  const data: Prisma.ServingPositionUncheckedUpdateManyInput = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.requiredQualifications !== undefined) {
    data.requiredQualifications = input.requiredQualifications.map((q) => q.trim()).filter(Boolean);
  }
  const result = await tenantDb.servingPosition.updateMany({ where: { id: positionId, organizationId }, data });
  return result.count > 0;
}

export async function removePosition(organizationId: string, positionId: string) {
  const result = await tenantDb.servingPosition.deleteMany({ where: { id: positionId, organizationId } });
  return result.count > 0;
}

// -- Assignments ---------------------------------------------------------------

/**
 * Assign a person to a position. Idempotent: an existing row is reactivated (history
 * preserved) rather than duplicated. Verifies both belong to the org.
 */
export async function assign(organizationId: string, positionId: string, personId: string) {
  const [position, person] = await Promise.all([
    tenantDb.servingPosition.findFirst({ where: { id: positionId, organizationId }, select: { id: true } }),
    tenantDb.person.findFirst({ where: { id: personId, organizationId }, select: { id: true } }),
  ]);
  if (!position || !person) return { ok: false as const };

  const existing = await tenantDb.servingAssignment.findFirst({ where: { organizationId, positionId, personId } });
  if (existing) {
    if (existing.status === ServingAssignmentStatus.ACTIVE) return { ok: true as const, reactivated: false };
    await tenantDb.servingAssignment.updateMany({
      where: { id: existing.id, organizationId },
      data: { status: ServingAssignmentStatus.ACTIVE, endedAt: null },
    });
    return { ok: true as const, reactivated: true };
  }

  await tenantDb.servingAssignment.create({ data: { organizationId, positionId, personId } });
  return { ok: true as const, reactivated: false };
}

/** End an assignment without deleting history (§10). */
export async function deactivateAssignment(organizationId: string, assignmentId: string) {
  const result = await tenantDb.servingAssignment.updateMany({
    where: { id: assignmentId, organizationId, status: ServingAssignmentStatus.ACTIVE },
    data: { status: ServingAssignmentStatus.INACTIVE, endedAt: new Date() },
  });
  return result.count > 0;
}

/** A person's serving involvement (active first) -- Person detail panel. */
export async function listServingForPerson(organizationId: string, personId: string) {
  return tenantDb.servingAssignment.findMany({
    where: { organizationId, personId },
    orderBy: [{ status: "asc" }, { startedAt: "desc" }],
    include: { position: { include: { team: { select: { id: true, name: true } } } } },
  });
}

// -- Qualifications ------------------------------------------------------------

/** Grant or refresh a named qualification (upsert on the unique person+name pair). */
export async function grantQualification(
  organizationId: string,
  personId: string,
  input: { name: string; expiresAt?: Date | null; notes?: string | null },
) {
  const person = await tenantDb.person.findFirst({ where: { id: personId, organizationId }, select: { id: true } });
  if (!person) return null;
  const name = input.name.trim();
  if (!name) return null;

  const existing = await tenantDb.personQualification.findFirst({ where: { organizationId, personId, name } });
  if (existing) {
    await tenantDb.personQualification.updateMany({
      where: { id: existing.id, organizationId },
      data: { grantedAt: new Date(), expiresAt: input.expiresAt ?? null, notes: input.notes?.trim() || null },
    });
    return existing.id;
  }
  const created = await tenantDb.personQualification.create({
    data: { organizationId, personId, name, expiresAt: input.expiresAt ?? null, notes: input.notes?.trim() || null },
  });
  return created.id;
}

export async function revokeQualification(organizationId: string, personId: string, name: string) {
  const result = await tenantDb.personQualification.deleteMany({ where: { organizationId, personId, name } });
  return result.count > 0;
}

export async function listQualificationsForPerson(organizationId: string, personId: string) {
  return tenantDb.personQualification.findMany({
    where: { organizationId, personId },
    orderBy: { name: "asc" },
  });
}
