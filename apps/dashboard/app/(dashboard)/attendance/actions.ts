"use server";

import { revalidatePath } from "next/cache";
import { auditService, kioskService } from "@cms/database";
import { getCurrentOrganization, getCurrentUser } from "../../../lib/session";
import { requireCheckin } from "../../../lib/checkin-access";

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

export async function createKioskAction(formData: FormData): Promise<void> {
  const organization = await getCurrentOrganization();
  if (!organization) return;
  await requireCheckin(organization.id, "checkin.manage");
  const kiosk = await kioskService.createKiosk(organization.id, {
    name: String(formData.get("name") ?? ""),
    calendarId: String(formData.get("calendarId") ?? "") || null,
  });
  await audit(organization.id, "kiosk.created", kiosk.id);
  revalidatePath("/attendance");
}

export async function setKioskEnabledAction(kioskId: string, enabled: boolean): Promise<void> {
  const organization = await getCurrentOrganization();
  if (!organization) return;
  await requireCheckin(organization.id, "checkin.manage");
  await kioskService.setKioskEnabled(organization.id, kioskId, enabled);
  await audit(organization.id, enabled ? "kiosk.enabled" : "kiosk.disabled", kioskId);
  revalidatePath("/attendance");
}

export async function deleteKioskAction(kioskId: string): Promise<void> {
  const organization = await getCurrentOrganization();
  if (!organization) return;
  await requireCheckin(organization.id, "checkin.manage");
  await kioskService.deleteKiosk(organization.id, kioskId);
  await audit(organization.id, "kiosk.deleted", kioskId);
  revalidatePath("/attendance");
}
