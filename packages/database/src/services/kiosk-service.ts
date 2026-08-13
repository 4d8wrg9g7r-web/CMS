import { randomInt } from "node:crypto";
import { HouseholdRole } from "@prisma/client";
import { rawDb, tenantDb } from "../client";

/**
 * Kids check-in kiosks (docs/domain/app.md "Check-in"): a kiosk is linked to
 * one calendar; /k/<publicKioskKey> resolves it (rawDb bootstrapping
 * exception, same boundary as forms/sites) and shows that calendar's events
 * for today. Lookup is exact phone/last-name only — the kiosk never exposes
 * the directory. Check-in mints a security code printed on the child tag AND
 * the guardian receipt; pickup requires the match.
 */

export async function listKiosks(organizationId: string) {
  return tenantDb.checkInKiosk.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
    include: { calendar: { select: { id: true, name: true, color: true } } },
  });
}

export async function createKiosk(organizationId: string, input: { name: string; calendarId?: string | null }) {
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new Error("The kiosk needs a name.");
  return tenantDb.checkInKiosk.create({ data: { organizationId, name, calendarId: input.calendarId || null } });
}

export async function setKioskEnabled(organizationId: string, kioskId: string, enabled: boolean) {
  const result = await tenantDb.checkInKiosk.updateMany({ where: { id: kioskId, organizationId }, data: { enabled } });
  return result.count > 0;
}

export async function deleteKiosk(organizationId: string, kioskId: string) {
  const result = await tenantDb.checkInKiosk.deleteMany({ where: { id: kioskId, organizationId } });
  return result.count > 0;
}

/** Public resolution by unguessable key — enabled kiosks only. */
export async function resolveKiosk(publicKioskKey: string) {
  const kiosk = await rawDb.checkInKiosk.findUnique({
    where: { publicKioskKey },
    include: { calendar: { select: { id: true, name: true, color: true } }, organization: { select: { id: true, name: true } } },
  });
  if (!kiosk || !kiosk.enabled) return null;
  return kiosk;
}

/**
 * Exact household lookup for the kiosk: a guardian's phone digits or household
 * last name. Returns household members split into kids (CHILD role or under
 * 18 by birthdate) and adults. No partial browsing.
 */
export async function kioskHouseholdLookup(organizationId: string, query: string) {
  const q = query.trim();
  if (q.length < 3) return [];
  const digits = q.replace(/\D/g, "");
  const people = await tenantDb.person.findMany({
    where: {
      organizationId,
      archivedAt: null,
      householdId: { not: null },
      ...(digits.length >= 7
        ? { phone: { contains: digits.slice(-7) } }
        : { lastName: { equals: q, mode: "insensitive" } }),
    },
    select: { householdId: true },
    take: 20,
  });
  const householdIds = [...new Set(people.map((p) => p.householdId).filter((v): v is string => !!v))].slice(0, 3);
  if (householdIds.length === 0) return [];

  const households = await tenantDb.household.findMany({
    where: { organizationId, id: { in: householdIds }, archivedAt: null },
    include: {
      members: {
        where: { archivedAt: null },
        select: { id: true, firstName: true, lastName: true, preferredName: true, householdRole: true, birthdate: true },
      },
    },
  });
  const isKid = (p: { householdRole: HouseholdRole | null; birthdate: Date | null }) =>
    p.householdRole === HouseholdRole.CHILD ||
    (p.birthdate !== null && Date.now() - p.birthdate.getTime() < 18 * 365.25 * 24 * 3600 * 1000);
  return households.map((h) => ({
    id: h.id,
    name: h.name,
    kids: h.members.filter(isKid),
    adults: h.members.filter((p: (typeof h.members)[number]) => !isKid(p)),
  }));
}

/** 3 letters + 2 digits, unambiguous alphabet — easy to read on a tag. */
export function newSecurityCode(): string {
  const letters = "ACDEFHJKLMNPRTWXY";
  const pick = (pool: string) => pool[randomInt(pool.length)]!;
  return `${pick(letters)}${pick(letters)}${pick(letters)}-${randomInt(10)}${randomInt(10)}`;
}

/**
 * Kiosk check-in for one or more kids into an event occurrence. One shared
 * security code per family per check-in batch (one guardian receipt). Returns
 * the code + per-kid rows for label printing. Idempotent per person via the
 * existing (eventId, occurrenceAt, personId) unique — re-checking-in returns
 * the existing rows' code when present.
 */
export async function kioskCheckIn(
  organizationId: string,
  input: { kioskId: string; eventId: string; occurrenceAt: Date; personIds: string[] },
) {
  const kiosk = await tenantDb.checkInKiosk.findFirst({ where: { id: input.kioskId, organizationId, enabled: true } });
  if (!kiosk) throw new Error("Kiosk not found.");
  const event = await tenantDb.event.findFirst({
    where: { id: input.eventId, organizationId, archivedAt: null },
    select: { id: true, title: true, calendarId: true },
  });
  if (!event) throw new Error("Event not found.");
  if (kiosk.calendarId && event.calendarId !== kiosk.calendarId) throw new Error("That event isn't on this kiosk's calendar.");

  const people = await tenantDb.person.findMany({
    where: { organizationId, id: { in: input.personIds }, archivedAt: null },
    select: { id: true, firstName: true, lastName: true, preferredName: true },
  });
  if (people.length === 0) throw new Error("Pick at least one child.");

  const securityCode = newSecurityCode();
  const results: { personId: string; name: string; securityCode: string }[] = [];
  for (const person of people) {
    const existing = await tenantDb.checkIn.findFirst({
      where: { organizationId, eventId: event.id, occurrenceAt: input.occurrenceAt, personId: person.id },
    });
    const code = existing?.securityCode ?? securityCode;
    if (!existing) {
      await tenantDb.checkIn.create({
        data: {
          organizationId,
          eventId: event.id,
          occurrenceAt: input.occurrenceAt,
          personId: person.id,
          method: "KIOSK",
          kioskId: kiosk.id,
          securityCode: code,
        },
      });
    }
    results.push({
      personId: person.id,
      name: `${person.preferredName || person.firstName} ${person.lastName}`.trim(),
      securityCode: code,
    });
  }
  return { eventTitle: event.title, checkIns: results };
}

/** Pickup: mark checked out when the presented code matches. */
export async function kioskCheckOut(
  organizationId: string,
  input: { eventId: string; occurrenceAt: Date; personId: string; securityCode: string },
) {
  const row = await tenantDb.checkIn.findFirst({
    where: { organizationId, eventId: input.eventId, occurrenceAt: input.occurrenceAt, personId: input.personId, checkedOutAt: null },
  });
  if (!row || !row.securityCode) return { ok: false as const, error: "not_found" as const };
  if (row.securityCode.toUpperCase() !== input.securityCode.trim().toUpperCase()) {
    return { ok: false as const, error: "code_mismatch" as const };
  }
  await tenantDb.checkIn.updateMany({ where: { id: row.id, organizationId }, data: { checkedOutAt: new Date() } });
  return { ok: true as const };
}
