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

// -- Email blasts (newsletters) ---------------------------------------------------

import { redirect } from "next/navigation";
import { validateBlastAudience } from "@cms/database";
import { markdownToEmailBody } from "@cms/email";
import { getPrivateStorageProvider, sanitizeStorageKey } from "@cms/storage";

// Not exported: a "use server" module may only export async functions.
const BLAST_MAX_ATTACHMENTS = 5;
const BLAST_MAX_TOTAL_ATTACHMENT_BYTES = 8 * 1024 * 1024; // 8 MB across all files

export interface BlastFormState {
  error: string | null;
}

/**
 * Compose-and-send: validates the audience + attachments, stores attachment bytes in
 * private storage, creates the blast (per-recipient consent-checked Message fan-out),
 * drains the outbox opportunistically, and lands on the blast detail page.
 */
export async function createBlastAction(_prev: BlastFormState, formData: FormData): Promise<BlastFormState> {
  const organization = await getCurrentOrganization();
  if (!organization) return { error: "No organization" };
  await requireMessages(organization.id, "message.manage");

  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "");
  if (!subject) return { error: "Subject is required." };
  if (!body.trim()) return { error: "Write the email body first." };

  const kind = String(formData.get("audienceKind") ?? "all");
  const validated = validateBlastAudience({
    kind,
    membershipStatus: String(formData.get("membershipStatus") ?? ""),
    campusId: String(formData.get("campusId") ?? ""),
    tag: String(formData.get("tag") ?? ""),
    groupId: String(formData.get("groupId") ?? ""),
    personIds: formData.getAll("personIds").map(String).filter(Boolean),
  });
  if (!validated.ok) return { error: validated.error };

  const files = formData.getAll("attachments").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > BLAST_MAX_ATTACHMENTS) {
    return { error: `At most ${BLAST_MAX_ATTACHMENTS} attachments per email.` };
  }
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  if (totalBytes > BLAST_MAX_TOTAL_ATTACHMENT_BYTES) {
    return { error: "Attachments are capped at 8 MB total — link large files instead." };
  }

  const actor = await getCurrentUser();
  const storage = getPrivateStorageProvider();
  const stamp = Date.now();
  const attachments = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const cleanName = file.name.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._-]+/, "") || `attachment-${i}`;
    const storageKey = sanitizeStorageKey(`org-${organization.id}/blasts/${stamp}-${i}-${cleanName}`);
    await storage.put(storageKey, Buffer.from(await file.arrayBuffer()));
    attachments.push({
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      storageKey,
    });
  }

  const result = await messageService.createEmailBlast(organization.id, {
    subject,
    bodyMarkdown: body,
    audience: validated.audience,
    attachments,
    createdByUserId: actor?.id ?? null,
  });

  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "message.blast_sent",
    targetType: "EmailBlast",
    targetId: result.blastId,
    metadata: {
      subject,
      audienceKind: validated.audience.kind,
      recipientCount: result.recipientCount,
      suppressedCount: result.suppressedCount,
      attachmentCount: attachments.length,
    },
  });

  after(async () => {
    try {
      await drainOutbox();
    } catch (err) {
      console.error("Opportunistic outbox drain failed (cron will retry):", err);
    }
  });

  revalidatePath("/messages");
  redirect(`/messages/blasts/${result.blastId}`);
}

/** Live composer preview: renders the same body HTML the recipient will get. */
export async function previewBlastAction(input: { markdown: string }): Promise<{ html: string }> {
  const organization = await getCurrentOrganization();
  if (!organization) return { html: "" };
  await requireMessages(organization.id, "message.manage");
  return { html: markdownToEmailBody(input.markdown.slice(0, 50000)) };
}
