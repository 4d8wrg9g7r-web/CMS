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

import path from "node:path";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { validateBlastAudience } from "@cms/database";
import { blocksToPlainText, renderBlocksEmailBody, validateEmailBlocks } from "@cms/email";
import { getPrivateStorageProvider, getStorageProvider, sanitizeStorageKey } from "@cms/storage";

// Not exported: a "use server" module may only export async functions.
const BLAST_MAX_ATTACHMENTS = 5;
const BLAST_MAX_TOTAL_ATTACHMENT_BYTES = 8 * 1024 * 1024; // 8 MB across all files
const IMAGE_MAX_BYTES = 4 * 1024 * 1024; // per inline newsletter image
const IMAGE_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export interface BlastFormState {
  error: string | null;
}

/**
 * Compose-and-send: validates the audience + attachments, stores attachment bytes in
 * private storage, creates the blast (per-recipient consent-checked Message fan-out),
 * drains the outbox opportunistically, and lands on the blast detail page.
 */
/**
 * Live recipient estimate for the guided composer's Audience step — same
 * validation and resolution path the send uses, so the number can't lie.
 * Consent suppression still happens per-recipient at send time.
 */
export async function estimateAudienceAction(input: {
  kind: string;
  membershipStatus?: string;
  campusId?: string;
  tag?: string;
  customFieldKey?: string;
  customFieldValue?: string;
  groupId?: string;
  personIds?: string[];
}): Promise<{ ok: true; count: number; noEmailCount: number } | { ok: false; error: string }> {
  const organization = await getCurrentOrganization();
  if (!organization) return { ok: false, error: "No organization" };
  await requireMessages(organization.id, "message.manage");

  const validated = validateBlastAudience({
    kind: input.kind,
    membershipStatus: input.membershipStatus ?? "",
    campusId: input.campusId ?? "",
    tag: input.tag ?? "",
    customFieldKey: input.customFieldKey ?? "",
    customFieldValue: input.customFieldValue ?? "",
    groupId: input.groupId ?? "",
    personIds: input.personIds ?? [],
  });
  if (!validated.ok) return { ok: false, error: validated.error };

  const { recipients, noEmailCount } = await messageService.resolveBlastRecipients(organization.id, validated.audience);
  return { ok: true, count: recipients.length, noEmailCount };
}

export async function createBlastAction(_prev: BlastFormState, formData: FormData): Promise<BlastFormState> {
  const organization = await getCurrentOrganization();
  if (!organization) return { error: "No organization" };
  await requireMessages(organization.id, "message.manage");

  const subject = String(formData.get("subject") ?? "").trim();
  if (!subject) return { error: "Subject is required." };

  // The composer submits the designed layout as a JSON block array; the stored
  // markdown body is its plain-text derivation (used for the text/plain part).
  let blocksInput: unknown;
  try {
    blocksInput = JSON.parse(String(formData.get("blocks") ?? "[]"));
  } catch {
    return { error: "The email layout could not be read — reload and try again." };
  }
  const blocksResult = validateEmailBlocks(blocksInput);
  if (!blocksResult.ok) return { error: blocksResult.error };
  const body = blocksToPlainText(blocksResult.blocks);

  const kind = String(formData.get("audienceKind") ?? "all");
  const validated = validateBlastAudience({
    kind,
    membershipStatus: String(formData.get("membershipStatus") ?? ""),
    campusId: String(formData.get("campusId") ?? ""),
    tag: String(formData.get("tag") ?? ""),
    customFieldKey: String(formData.get("customFieldKey") ?? ""),
    customFieldValue: String(formData.get("customFieldValue") ?? ""),
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
    blocks: blocksResult.blocks,
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
export async function previewBlastAction(input: { blocks: unknown }): Promise<{ html: string }> {
  const organization = await getCurrentOrganization();
  if (!organization) return { html: "" };
  await requireMessages(organization.id, "message.manage");
  const result = validateEmailBlocks(input.blocks);
  return { html: result.ok ? renderBlocksEmailBody(result.blocks) : "" };
}

/**
 * Upload an inline newsletter image (header art etc.) to PUBLIC storage — email
 * clients fetch images by URL, so unlike attachments these cannot live in the
 * private bucket. Returns an absolute http(s) URL that satisfies the image-block
 * validator; local-dev uploads land under public/uploads and are absolutized
 * from the request origin.
 */
export async function uploadBlastImageAction(formData: FormData): Promise<{ url: string } | { error: string }> {
  const organization = await getCurrentOrganization();
  if (!organization) return { error: "No organization" };
  await requireMessages(organization.id, "message.manage");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image file." };
  if (!IMAGE_CONTENT_TYPES.has(file.type)) return { error: "Images must be PNG, JPEG, GIF, or WebP." };
  if (file.size > IMAGE_MAX_BYTES) return { error: "Images are capped at 4 MB." };

  const saved = await getStorageProvider(path.join(process.cwd(), "public")).saveFile({
    organizationId: organization.id,
    fileName: file.name,
    contentType: file.type,
    data: Buffer.from(await file.arrayBuffer()),
  });

  let url = saved.url;
  if (url.startsWith("/")) {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (!host) return { error: "Could not determine the site URL for the image." };
    const proto = h.get("x-forwarded-proto") ?? "http";
    url = `${proto}://${host}${url}`;
  }
  return { url };
}
