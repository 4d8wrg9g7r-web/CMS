"use server";

import { revalidatePath } from "next/cache";
import { auditService, isValidTimeZone, organizationService } from "@cms/database";
import { getCurrentOrganization, getCurrentUser, requireOrgRole } from "../../lib/session";
import { invalid, ok, type ActionResult } from "../../lib/action-result";

/** Shared by the settings picker and the first-run banner (UX audit #1). */
export async function setOrganizationTimezoneAction(formData: FormData): Promise<ActionResult> {
  const organization = await getCurrentOrganization();
  if (!organization) return { ok: false, formError: "No organization." };
  try {
    await requireOrgRole(organization.id, ["OWNER", "ADMIN"]);
  } catch {
    return { ok: false, formError: "Only owners and admins can change the timezone." };
  }

  const timezone = String(formData.get("timezone") ?? "").trim();
  if (!timezone || !isValidTimeZone(timezone)) {
    return invalid({ timezone: "Pick a valid timezone." });
  }

  await organizationService.setOrganizationTimezone(organization.id, timezone);
  const user = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: user?.id,
    action: "organization.timezone_updated",
    targetType: "Organization",
    targetId: organization.id,
    metadata: { timezone },
  });

  revalidatePath("/", "layout");
  return ok(`Timezone set to ${timezone.replaceAll("_", " ")}`);
}
