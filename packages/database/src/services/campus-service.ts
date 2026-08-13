import { tenantDb } from "../client";

/**
 * Campus is the platform's physical-location primitive (BLUEPRINT §12): People,
 * Groups, Events, and Serving Teams can each be pinned to one. Campuses are
 * archived, never deleted — history (check-ins, registrations) keeps pointing at them.
 */

export async function listCampuses(organizationId: string, opts?: { includeArchived?: boolean }) {
  return tenantDb.campus.findMany({
    where: { organizationId, ...(opts?.includeArchived ? {} : { archivedAt: null }) },
    orderBy: { name: "asc" },
  });
}

export async function getCampus(organizationId: string, campusId: string) {
  return tenantDb.campus.findFirst({ where: { organizationId, id: campusId } });
}

export async function createCampus(
  organizationId: string,
  params: { name: string; address?: string | null; latitude?: number | null; longitude?: number | null },
) {
  return tenantDb.campus.create({
    data: {
      organizationId,
      name: params.name,
      address: params.address ?? null,
      latitude: params.latitude ?? null,
      longitude: params.longitude ?? null,
    },
  });
}

export async function updateCampus(
  organizationId: string,
  campusId: string,
  params: { name?: string; address?: string | null; latitude?: number | null; longitude?: number | null },
) {
  return tenantDb.campus.updateMany({ where: { organizationId, id: campusId }, data: params });
}

export async function setCampusArchived(organizationId: string, campusId: string, archived: boolean) {
  return tenantDb.campus.updateMany({
    where: { organizationId, id: campusId },
    data: { archivedAt: archived ? new Date() : null },
  });
}
