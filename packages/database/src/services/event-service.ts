import { EventRecurrence, EventRegistrationStatus, Prisma } from "@prisma/client";
import { rawDb, tenantDb } from "../client";
import { personDisplayName } from "../people/helpers";
import { emit } from "./outbox-service";
import { findByEmail } from "./people-service";

/**
 * Events service (BLUEPRINT §13). Tenant-scoped for staff operations; resolvePublicEvent
 * and register are the public bootstrapping paths (publicId → org context, same boundary
 * as forms/widgets/prayer). Registration stores the row and emits EventRegistered in ONE
 * transaction (§38) — person matching happens before the transaction so the row links
 * immediately, but a match/create failure downgrades to an unlinked registration rather
 * than losing the signup.
 */

export interface EventInput {
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: Date;
  endAt?: Date | null;
  allDay?: boolean;
  recurrence?: EventRecurrence;
  recurrenceInterval?: number;
  recurrenceUntil?: Date | null;
  capacity?: number | null;
  campusId?: string | null;
  calendarId?: string | null;
}

export async function listEvents(
  organizationId: string,
  opts: { includeArchived?: boolean; publishedOnly?: boolean; campusId?: string; calendarId?: string } = {},
) {
  return tenantDb.event.findMany({
    where: {
      organizationId,
      ...(opts.includeArchived ? {} : { archivedAt: null }),
      ...(opts.publishedOnly ? { isPublished: true } : {}),
      ...(opts.campusId ? { campusId: opts.campusId } : {}),
      ...(opts.calendarId ? { calendarId: opts.calendarId } : {}),
    },
    orderBy: { startAt: "asc" },
    include: {
      calendar: { select: { id: true, name: true, color: true } },
      _count: { select: { registrations: { where: { status: EventRegistrationStatus.REGISTERED } } } },
    },
  });
}

// ---------------------------------------------------------------------------
// Calendars: named, colored groupings (Youth, Worship…) events file under.
// ---------------------------------------------------------------------------

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export async function listCalendars(organizationId: string, opts: { includeArchived?: boolean } = {}) {
  return tenantDb.eventCalendar.findMany({
    where: { organizationId, ...(opts.includeArchived ? {} : { archivedAt: null }) },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { events: { where: { archivedAt: null } } } } },
  });
}

export async function createCalendar(organizationId: string, input: { name: string; color?: string }) {
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new Error("The calendar needs a name.");
  const color = input.color && HEX_COLOR.test(input.color) ? input.color : "#2566e8";
  return tenantDb.eventCalendar.create({ data: { organizationId, name, color } });
}

export async function updateCalendar(
  organizationId: string,
  calendarId: string,
  input: { name?: string; color?: string },
) {
  const data: { name?: string; color?: string } = {};
  if (input.name !== undefined) {
    const name = input.name.trim().slice(0, 80);
    if (!name) throw new Error("The calendar needs a name.");
    data.name = name;
  }
  if (input.color !== undefined && HEX_COLOR.test(input.color)) data.color = input.color;
  const result = await tenantDb.eventCalendar.updateMany({ where: { id: calendarId, organizationId }, data });
  return result.count > 0;
}

/** Soft-archive: events keep their link but the calendar leaves pickers/filters. */
export async function archiveCalendar(organizationId: string, calendarId: string) {
  const result = await tenantDb.eventCalendar.updateMany({
    where: { id: calendarId, organizationId },
    data: { archivedAt: new Date() },
  });
  return result.count > 0;
}

export async function getEvent(organizationId: string, eventId: string) {
  return tenantDb.event.findFirst({
    where: { id: eventId, organizationId },
    include: {
      campus: { select: { id: true, name: true } },
      calendar: { select: { id: true, name: true, color: true } },
      _count: { select: { registrations: { where: { status: EventRegistrationStatus.REGISTERED } } } },
    },
  });
}

export async function listRegistrations(organizationId: string, eventId: string) {
  return tenantDb.eventRegistration.findMany({
    where: { organizationId, eventId },
    orderBy: { createdAt: "desc" },
    include: { person: { select: { id: true, firstName: true, lastName: true, preferredName: true } } },
  });
}

function eventData(input: EventInput) {
  return {
    title: input.title.trim(),
    description: input.description?.trim() || null,
    location: input.location?.trim() || null,
    startAt: input.startAt,
    endAt: input.endAt ?? null,
    allDay: input.allDay ?? false,
    recurrence: input.recurrence ?? EventRecurrence.NONE,
    recurrenceInterval: Math.max(1, input.recurrenceInterval ?? 1),
    recurrenceUntil: input.recurrenceUntil ?? null,
    capacity: input.capacity ?? null,
    campusId: input.campusId ?? null,
    calendarId: input.calendarId ?? null,
  };
}

export async function createEvent(organizationId: string, input: EventInput) {
  return tenantDb.event.create({ data: { organizationId, ...eventData(input) } });
}

export async function updateEvent(organizationId: string, eventId: string, input: EventInput) {
  const result = await tenantDb.event.updateMany({
    where: { id: eventId, organizationId },
    data: eventData(input),
  });
  if (result.count === 0) return null;
  return getEvent(organizationId, eventId);
}

export async function setEventImage(organizationId: string, eventId: string, imageUrl: string | null) {
  const result = await tenantDb.event.updateMany({ where: { id: eventId, organizationId }, data: { imageUrl } });
  return result.count > 0;
}

export async function setPublished(organizationId: string, eventId: string, isPublished: boolean) {
  const result = await tenantDb.event.updateMany({ where: { id: eventId, organizationId }, data: { isPublished } });
  return result.count > 0;
}

export async function archiveEvent(organizationId: string, eventId: string) {
  const result = await tenantDb.event.updateMany({
    where: { id: eventId, organizationId },
    data: { archivedAt: new Date(), isPublished: false },
  });
  return result.count > 0;
}

export async function restoreEvent(organizationId: string, eventId: string) {
  const result = await tenantDb.event.updateMany({
    where: { id: eventId, organizationId },
    data: { archivedAt: null },
  });
  return result.count > 0;
}

export interface PublicEvent {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  location: string | null;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
  recurrence: EventRecurrence;
  recurrenceInterval: number;
  recurrenceUntil: Date | null;
  capacity: number | null;
  registeredCount: number;
  imageUrl: string | null;
}

/**
 * Resolve a published event by public id -- no tenant context yet, so rawDb
 * (documented bootstrapping exception).
 */
export async function resolvePublicEvent(publicId: string): Promise<PublicEvent | null> {
  const event = await rawDb.event.findUnique({
    where: { publicId },
    include: { _count: { select: { registrations: { where: { status: EventRegistrationStatus.REGISTERED } } } } },
  });
  if (!event || !event.isPublished || event.archivedAt) return null;
  return {
    id: event.id,
    organizationId: event.organizationId,
    title: event.title,
    description: event.description,
    location: event.location,
    startAt: event.startAt,
    endAt: event.endAt,
    allDay: event.allDay,
    recurrence: event.recurrence,
    recurrenceInterval: event.recurrenceInterval,
    recurrenceUntil: event.recurrenceUntil,
    capacity: event.capacity,
    registeredCount: event._count.registrations,
    imageUrl: event.imageUrl,
  };
}

export type RegisterResult =
  | { ok: true; registrationId: string; alreadyRegistered: boolean; personId: string | null }
  | { ok: false; reason: "full" | "invalid" };

/**
 * Public registration. Capacity is enforced over REGISTERED rows; a person who already
 * registered gets an idempotent "already registered" instead of a duplicate. The
 * registration row and the EventRegistered outbox event commit atomically.
 */
export async function register(
  event: PublicEvent,
  input: { firstName: string; lastName: string; email?: string | null },
): Promise<RegisterResult> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email?.trim() || null;
  if (!firstName || !lastName) return { ok: false, reason: "invalid" };

  // Match-or-create the Person BEFORE the registration transaction so the row links
  // immediately; a failure here downgrades to an unlinked registration.
  let personId: string | null = null;
  try {
    if (email) {
      const existing = await findByEmail(event.organizationId, email);
      if (existing) personId = existing.id;
    }
    if (!personId) {
      // createPerson emits PersonCreated in its own transaction (people-service).
      const { createPerson } = await import("./people-service");
      const person = await createPerson(event.organizationId, { firstName, lastName, email });
      personId = person.id;
    }
  } catch (err) {
    console.error("Event registration person match/create failed -- storing unlinked:", err);
  }

  if (personId) {
    const existing = await tenantDb.eventRegistration.findFirst({
      where: { organizationId: event.organizationId, eventId: event.id, personId },
    });
    if (existing && existing.status === EventRegistrationStatus.REGISTERED) {
      return { ok: true, registrationId: existing.id, alreadyRegistered: true, personId };
    }
    if (existing) {
      // Re-registering after a cancellation: flip the existing row back.
      const registered = await tenantDb.eventRegistration.updateMany({
        where: { id: existing.id, organizationId: event.organizationId },
        data: { status: EventRegistrationStatus.REGISTERED },
      });
      if (registered.count > 0) return { ok: true, registrationId: existing.id, alreadyRegistered: false, personId };
    }
  }

  const registeredCount = await tenantDb.eventRegistration.count({
    where: { organizationId: event.organizationId, eventId: event.id, status: EventRegistrationStatus.REGISTERED },
  });
  if (event.capacity !== null && registeredCount >= event.capacity) return { ok: false, reason: "full" };

  const name = personDisplayName({ firstName, lastName });
  const registration = await rawDb.$transaction(async (tx) => {
    const created = await tx.eventRegistration.create({
      data: { organizationId: event.organizationId, eventId: event.id, personId, name, email },
    });
    await emit(tx, {
      organizationId: event.organizationId,
      type: "EventRegistered",
      payload: {
        eventId: event.id,
        eventTitle: event.title,
        registrationId: created.id,
        registrantName: name,
        registrantEmail: email,
        personId,
      },
    });
    return created;
  });

  return { ok: true, registrationId: registration.id, alreadyRegistered: false, personId };
}

export async function cancelRegistration(organizationId: string, registrationId: string) {
  const result = await tenantDb.eventRegistration.updateMany({
    where: { id: registrationId, organizationId, status: EventRegistrationStatus.REGISTERED },
    data: { status: EventRegistrationStatus.CANCELLED },
  });
  return result.count > 0;
}
