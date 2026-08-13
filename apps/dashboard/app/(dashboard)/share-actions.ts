"use server";

import { auditService } from "@cms/database";
import { getCurrentOrganization, getCurrentUser } from "../../lib/session";
import { requireApp } from "../../lib/app-access";
import { sendAppPush } from "../../lib/app-push";

/**
 * Share-box push (docs/design-system.md "Share"): notify every subscribed app
 * member about one item (event, sermon, page). Gated on app.manage — the same
 * responsibility as church-wide announcements, which use the same fan-out.
 */
export async function sendItemPushAction(formData: FormData): Promise<void> {
  const organization = await getCurrentOrganization();
  if (!organization) return;
  await requireApp(organization.id, "app.manage");

  const title = String(formData.get("title") ?? "").trim().slice(0, 120);
  const body = String(formData.get("body") ?? "").trim().slice(0, 300);
  const url = String(formData.get("url") ?? "").trim().slice(0, 1000);
  if (!title) throw new Error("The notification needs a title.");
  if (!/^https?:\/\//.test(url) && !url.startsWith("/")) throw new Error("Bad link.");

  await sendAppPush(organization.id, { title, body: body || title, url });

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "share.push_sent",
    targetType: "Organization",
    targetId: organization.id,
    metadata: { title, url },
  });
}
