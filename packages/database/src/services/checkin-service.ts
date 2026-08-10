import { Prisma } from "@prisma/client";
import { tenantDb } from "../client";

/**
 * Check-In service (BLUEPRINT §12 attendance foundations). Tenant-scoped throughout; the
 * occurrence key is the occurrence's start instant (docs/domain/checkin.md). Adult/
 * general attendance only -- nothing child-safety-specific lives here (§66).
 */

export async function checkIn(
  organizationId: string,
  eventId: string,
  occurrenceAt: Date,
  personId: string,
  checkedInByUserId?: string | null,
): Promise<{ ok: boolean; alreadyCheckedIn: boolean }> {
  const [event, person] = await Promise.all([
    tenantDb.event.findFirst({ where: { id: eventId, organizationId }, select: { id: true } }),
    tenantDb.person.findFirst({ where: { id: personId, organizationId }, select: { id: true } }),
  ]);
  if (!event || !person) return { ok: false, alreadyCheckedIn: false };

  try {
    await tenantDb.checkIn.create({
      data: { organizationId, eventId, occurrenceAt, personId, checkedInByUserId: checkedInByUserId ?? null },
    });
    return { ok: true, alreadyCheckedIn: false };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: true, alreadyCheckedIn: true };
    }
    throw err;
  }
}

/** Stamp a departure time on an existing check-in. */
export async function checkOut(organizationId: string, checkInId: string) {
  const result = await tenantDb.checkIn.updateMany({
    where: { id: checkInId, organizationId, checkedOutAt: null },
    data: { checkedOutAt: new Date() },
  });
  return result.count > 0;
}

/** Mistake correction: remove the record entirely (distinct from check-out; audited by callers). */
export async function undoCheckIn(organizationId: string, checkInId: string) {
  const result = await tenantDb.checkIn.deleteMany({ where: { id: checkInId, organizationId } });
  return result.count > 0;
}

export async function listForOccurrence(organizationId: string, eventId: string, occurrenceAt: Date) {
  return tenantDb.checkIn.findMany({
    where: { organizationId, eventId, occurrenceAt },
    orderBy: { checkedInAt: "asc" },
    include: { person: { select: { id: true, firstName: true, lastName: true, preferredName: true } } },
  });
}

export async function countForOccurrence(organizationId: string, eventId: string, occurrenceAt: Date) {
  return tenantDb.checkIn.count({ where: { organizationId, eventId, occurrenceAt } });
}

/** A person's recent attendance -- powers the Person history panel. */
export async function listCheckInsForPerson(organizationId: string, personId: string, take = 10) {
  return tenantDb.checkIn.findMany({
    where: { organizationId, personId },
    orderBy: { occurrenceAt: "desc" },
    take,
    include: { event: { select: { id: true, title: true } } },
  });
}
