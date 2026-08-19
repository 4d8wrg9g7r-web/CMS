"use server";

import { revalidatePath } from "next/cache";
import { auditService, kioskService } from "@cms/database";
import { getCurrentOrganization, getCurrentUser } from "../../../lib/session";
import { requireCheckin } from "../../../lib/checkin-access";
import { invalid, ok, type ActionResult } from "../../../lib/action-result";

async function audit(organizationId: string, action: string, targetId: string) {
  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId,
    actorUserId: actor?.id,
    action,
    targetType: "CheckInKiosk",
    targetId,
  });
}

export async function createKioskAction(formData: FormData): Promise<ActionResult> {
  const organization = await getCurrentOrganization();
  if (!organization) return { ok: false, formError: "No organization." };
  await requireCheckin(organization.id, "checkin.manage");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return invalid({ name: "Give the kiosk a name — e.g. Kids Wing." });
  const kiosk = await kioskService.createKiosk(organization.id, {
    name,
    calendarId: String(formData.get("calendarId") ?? "") || null,
  });
  await audit(organization.id, "kiosk.created", kiosk.id);
  revalidatePath("/attendance");
  return ok(`Kiosk "${kiosk.name}" added`);
}

export async function setKioskEnabledAction(kioskId: string, enabled: boolean): Promise<ActionResult> {
  const organization = await getCurrentOrganization();
  if (!organization) return { ok: false, formError: "No organization." };
  await requireCheckin(organization.id, "checkin.manage");
  await kioskService.setKioskEnabled(organization.id, kioskId, enabled);
  await audit(organization.id, enabled ? "kiosk.enabled" : "kiosk.disabled", kioskId);
  revalidatePath("/attendance");
  return ok(enabled ? "Kiosk enabled" : "Kiosk disabled — its link stops working until re-enabled");
}

export async function deleteKioskAction(kioskId: string): Promise<ActionResult> {
  const organization = await getCurrentOrganization();
  if (!organization) return { ok: false, formError: "No organization." };
  await requireCheckin(organization.id, "checkin.manage");
  await kioskService.deleteKiosk(organization.id, kioskId);
  await audit(organization.id, "kiosk.deleted", kioskId);
  revalidatePath("/attendance");
  return ok("Kiosk deleted");
}
