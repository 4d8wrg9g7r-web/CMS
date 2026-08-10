"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { auditService, messageService } from "@cms/database";
import { getCurrentOrganization, getCurrentUser } from "../../../lib/session";
import { requireMessages } from "../../../lib/messages-access";
import { drainOutbox } from "../../../lib/outbox-worker";

/** Resend a FAILED message as a fresh queued message (full history preserved). */
export async function resendMessageAction(messageId: string) {
  const organization = await getCurrentOrganization();
  if (!organization) throw new Error("No organization");
  await requireMessages(organization.id, "message.manage");

  const result = await messageService.resend(organization.id, messageId);
  if (!result) throw new Error("Only failed messages can be resent.");

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "message.resent",
    targetType: "Message",
    targetId: messageId,
    metadata: { newMessageId: result.messageId },
  });

  after(async () => {
    try {
      await drainOutbox();
    } catch (err) {
      console.error("Opportunistic outbox drain failed (cron will retry):", err);
    }
  });

  revalidatePath("/messages");
}
