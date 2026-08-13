"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditService, eventService, type EventRecurrence } from "@cms/database";
import { getCurrentOrganization, getCurrentUser } from "../../../lib/session";
import { requireEvents } from "../../../lib/events-access";

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

function readEventInput(formData: FormData) {
  const startRaw = str(formData, "startAt");
  const endRaw = str(formData, "endAt");
  const untilRaw = str(formData, "recurrenceUntil");
  const capacityRaw = Number.parseInt(str(formData, "capacity"), 10);
  const intervalRaw = Number.parseInt(str(formData, "recurrenceInterval"), 10);

  const startAt = new Date(startRaw);
  if (!startRaw || Number.isNaN(startAt.getTime())) throw new Error("A valid start date/time is required.");

  return {
    title: str(formData, "title"),
    description: str(formData, "description") || null,
    location: str(formData, "location") || null,
    startAt,
    endAt: endRaw && !Number.isNaN(new Date(endRaw).getTime()) ? new Date(endRaw) : null,
    allDay: formData.get("allDay") === "on",
    recurrence: (str(formData, "recurrence") || "NONE") as EventRecurrence,
    recurrenceInterval: Number.isFinite(intervalRaw) && intervalRaw > 0 ? intervalRaw : 1,
    recurrenceUntil: untilRaw ? new Date(`${untilRaw}T23:59:59Z`) : null,
    capacity: Number.isFinite(capacityRaw) && capacityRaw > 0 ? capacityRaw : null,
    campusId: str(formData, "campusId") || null,
    calendarId: str(formData, "calendarId") || null,
    allowAppCheckIn: formData.get("allowAppCheckIn") === "on",
  };
}

export async function createEventAction(formData: FormData) {
  const organization = await requireOrg();
  await requireEvents(organization.id, "event.manage");

  const input = readEventInput(formData);
  if (!input.title) throw new Error("Event title is required.");

  const event = await eventService.createEvent(organization.id, input);
  await audit(organization.id, "event.created", event.id, { title: input.title });
  redirect(`/events/${event.id}`);
}

export async function updateEventAction(eventId: string, formData: FormData) {
  const organization = await requireOrg();
  await requireEvents(organization.id, "event.manage");

  const input = readEventInput(formData);
  if (!input.title) throw new Error("Event title is required.");

  const updated = await eventService.updateEvent(organization.id, eventId, input);
  if (!updated) throw new Error("Event not found.");
  await audit(organization.id, "event.updated", eventId);
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
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

export async function createCalendarAction(formData: FormData): Promise<void> {
  const organization = await requireOrg();
  await requireEvents(organization.id, "event.manage");
  const calendar = await eventService.createCalendar(organization.id, {
    name: String(formData.get("name") ?? ""),
    color: String(formData.get("color") ?? ""),
  });
  await audit(organization.id, "event.calendar_created", calendar.id, { name: calendar.name });
  revalidatePath("/events");
}

export async function archiveCalendarAction(calendarId: string): Promise<void> {
  const organization = await requireOrg();
  await requireEvents(organization.id, "event.manage");
  const archived = await eventService.archiveCalendar(organization.id, calendarId);
  if (archived) await audit(organization.id, "event.calendar_archived", calendarId);
  revalidatePath("/events");
}
