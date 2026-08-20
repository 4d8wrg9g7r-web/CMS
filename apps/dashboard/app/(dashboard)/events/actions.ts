"use server";

import { revalidatePath } from "next/cache";
import {
  auditService,
  eventService,
  endOfDayInTimeZone,
  parseDateTimeLocalValue,
  DEFAULT_TIMEZONE,
  type EventRecurrence,
} from "@cms/database";
import { getCurrentOrganization, getCurrentUser } from "../../../lib/session";
import { requireEvents } from "../../../lib/events-access";
import { invalid, ok, type ActionResult } from "../../../lib/action-result";

/**
 * Events staff server actions. Authorization enforced server-side via requireEvents
 * (BLUEPRINT §34); every mutation records an audit event (§47).
 */

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

async function requireOrg() {
  const organization = await getCurrentOrganization();
  if (!organization) throw new Error("No organization");
  return organization;
}

async function audit(organizationId: string, action: string, eventId: string, metadata?: Record<string, unknown>) {
  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId,
    actorUserId: actor?.id,
    action,
    targetType: "Event",
    targetId: eventId,
    metadata,
  });
}

function eventFieldErrors(formData: FormData, timeZone: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!str(formData, "title")) errors.title = "Give the event a title.";
  if (!parseDateTimeLocalValue(str(formData, "startAt"), timeZone)) errors.startAt = "Pick a start date and time.";
  return errors;
}

/** Form wall-clock values are in the org's timezone (UX audit #1). */
function readEventInput(formData: FormData, timeZone: string) {
  const untilRaw = str(formData, "recurrenceUntil");
  const capacityRaw = Number.parseInt(str(formData, "capacity"), 10);
  const intervalRaw = Number.parseInt(str(formData, "recurrenceInterval"), 10);

  return {
    title: str(formData, "title"),
    description: str(formData, "description") || null,
    location: str(formData, "location") || null,
    startAt: parseDateTimeLocalValue(str(formData, "startAt"), timeZone)!,
    endAt: parseDateTimeLocalValue(str(formData, "endAt"), timeZone),
    allDay: formData.get("allDay") === "on",
    recurrence: (str(formData, "recurrence") || "NONE") as EventRecurrence,
    recurrenceInterval: Number.isFinite(intervalRaw) && intervalRaw > 0 ? intervalRaw : 1,
    recurrenceUntil: untilRaw ? endOfDayInTimeZone(untilRaw, timeZone) : null,
    capacity: Number.isFinite(capacityRaw) && capacityRaw > 0 ? capacityRaw : null,
    campusId: str(formData, "campusId") || null,
    calendarId: str(formData, "calendarId") || null,
    allowAppCheckIn: formData.get("allowAppCheckIn") === "on",
  };
}

export async function createEventAction(formData: FormData): Promise<ActionResult> {
  const organization = await requireOrg();
  await requireEvents(organization.id, "event.manage");

  const timeZone = organization.timezone ?? DEFAULT_TIMEZONE;
  const errors = eventFieldErrors(formData, timeZone);
  if (Object.keys(errors).length > 0) return invalid(errors);

  const event = await eventService.createEvent(organization.id, readEventInput(formData, timeZone));
  await audit(organization.id, "event.created", event.id, { title: event.title });
  revalidatePath("/events");
  return ok("Event created", `/events/${event.id}`);
}

export async function updateEventAction(eventId: string, formData: FormData): Promise<ActionResult> {
  const organization = await requireOrg();
  await requireEvents(organization.id, "event.manage");

  const timeZone = organization.timezone ?? DEFAULT_TIMEZONE;
  const errors = eventFieldErrors(formData, timeZone);
  if (Object.keys(errors).length > 0) return invalid(errors);

  const updated = await eventService.updateEvent(organization.id, eventId, readEventInput(formData, timeZone));
  if (!updated) return { ok: false, formError: "This event no longer exists." };
  await audit(organization.id, "event.updated", eventId);
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
  return ok("Event saved");
}

export async function setEventPublishedAction(eventId: string, isPublished: boolean) {
  const organization = await requireOrg();
  await requireEvents(organization.id, "event.manage");
  await eventService.setPublished(organization.id, eventId, isPublished);
  await audit(organization.id, isPublished ? "event.published" : "event.unpublished", eventId);
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
}

export async function archiveEventAction(eventId: string) {
  const organization = await requireOrg();
  await requireEvents(organization.id, "event.manage");
  await eventService.archiveEvent(organization.id, eventId);
  await audit(organization.id, "event.archived", eventId);
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
}

export async function restoreEventAction(eventId: string) {
  const organization = await requireOrg();
  await requireEvents(organization.id, "event.manage");
  await eventService.restoreEvent(organization.id, eventId);
  await audit(organization.id, "event.restored", eventId);
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
}

export async function cancelRegistrationAction(eventId: string, registrationId: string) {
  const organization = await requireOrg();
  // Cancelling a registration reveals/affects registration data -> the stricter action.
  await requireEvents(organization.id, "event.registrations.view");
  await eventService.cancelRegistration(organization.id, registrationId);
  await audit(organization.id, "event.registration_cancelled", eventId, { registrationId });
  revalidatePath(`/events/${eventId}`);
}


// ---------------------------------------------------------------------------
// Calendars
// ---------------------------------------------------------------------------

export async function createCalendarAction(formData: FormData): Promise<ActionResult> {
  const organization = await requireOrg();
  await requireEvents(organization.id, "event.manage");
  const name = str(formData, "name");
  if (!name) return invalid({ name: "Give the calendar a name." });
  const calendar = await eventService.createCalendar(organization.id, {
    name,
    color: String(formData.get("color") ?? ""),
  });
  await audit(organization.id, "event.calendar_created", calendar.id, { name: calendar.name });
  revalidatePath("/events");
  return ok(`Calendar "${calendar.name}" added`);
}

export async function archiveCalendarAction(calendarId: string): Promise<void> {
  const organization = await requireOrg();
  await requireEvents(organization.id, "event.manage");
  const archived = await eventService.archiveCalendar(organization.id, calendarId);
  if (archived) await audit(organization.id, "event.calendar_archived", calendarId);
  revalidatePath("/events");
}
