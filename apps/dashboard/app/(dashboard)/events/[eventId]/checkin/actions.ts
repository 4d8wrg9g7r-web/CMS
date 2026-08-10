"use server";

import { revalidatePath } from "next/cache";
import { auditService, checkinService } from "@cms/database";
import { getCurrentOrganization, getCurrentUser } from "../../../../../lib/session";
import { requireCheckin } from "../../../../../lib/checkin-access";

/**
 * Check-In server actions. Authorization enforced server-side via requireCheckin
 * (BLUEPRINT §34); every mutation records an audit event (§47). The occurrence is passed
 * as an ISO string bound from the roster page.
 */

async function requireOrg() {
  const organization = await getCurrentOrganization();
  if (!organization) throw new Error("No organization");
  return organization;
}

async function audit(organizationId: string, action: string, eventId: string, metadata: Record<string, unknown>) {
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

function rosterPath(eventId: string, occurrenceIso: string) {
  return `/events/${eventId}/checkin?occ=${encodeURIComponent(occurrenceIso)}`;
}

export async function checkInAction(eventId: string, occurrenceIso: string, formData: FormData) {
  const organization = await requireOrg();
  await requireCheckin(organization.id, "checkin.manage");

  const personId = String(formData.get("personId") ?? "").trim();
  if (!personId) throw new Error("Choose a person to check in.");

  const actor = await getCurrentUser();
  const result = await checkinService.checkIn(organization.id, eventId, new Date(occurrenceIso), personId, actor?.id);
  if (!result.ok) throw new Error("Event or person not found.");
  if (!result.alreadyCheckedIn) {
    await audit(organization.id, "checkin.recorded", eventId, { personId, occurrenceAt: occurrenceIso });
  }
  revalidatePath(rosterPath(eventId, occurrenceIso));
}

export async function checkOutAction(eventId: string, occurrenceIso: string, checkInId: string) {
  const organization = await requireOrg();
  await requireCheckin(organization.id, "checkin.manage");
  const changed = await checkinService.checkOut(organization.id, checkInId);
  if (changed) await audit(organization.id, "checkin.checked_out", eventId, { checkInId, occurrenceAt: occurrenceIso });
  revalidatePath(rosterPath(eventId, occurrenceIso));
}

export async function undoCheckInAction(eventId: string, occurrenceIso: string, checkInId: string) {
  const organization = await requireOrg();
  await requireCheckin(organization.id, "checkin.manage");
  const removed = await checkinService.undoCheckIn(organization.id, checkInId);
  if (removed) await audit(organization.id, "checkin.removed", eventId, { checkInId, occurrenceAt: occurrenceIso });
  revalidatePath(rosterPath(eventId, occurrenceIso));
}
