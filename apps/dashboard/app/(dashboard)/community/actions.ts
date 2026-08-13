"use server";

import path from "node:path";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";
import { appFeedService, appService, auditService, livestreamChatService } from "@cms/database";
import { getStorageProvider } from "@cms/storage";
import { getCurrentOrganization, getCurrentUser } from "../../../lib/session";
import { requireApp } from "../../../lib/app-access";
import { sendAppPush } from "../../../lib/app-push";

// Not exported: a "use server" module may only export async functions.
const PHOTO_MAX_BYTES = 4 * 1024 * 1024;
const PHOTO_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export interface AnnouncementFormState {
  error: string | null;
}

/** Post a church announcement to the app's home feed. */
export async function createAnnouncementAction(
  _prev: AnnouncementFormState,
  formData: FormData,
): Promise<AnnouncementFormState> {
  const organization = await getCurrentOrganization();
  if (!organization) return { error: "No organization" };
  await requireApp(organization.id, "app.manage");

  let post;
  try {
    post = await appFeedService.createChurchPost(organization.id, {
      body: String(formData.get("body") ?? ""),
      imageUrl: String(formData.get("imageUrl") ?? "") || null,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not post" };
  }

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "app.announcement_posted",
    targetType: "AppPost",
    targetId: post.id,
  });

  // Lock-screen push to subscribed members (no-op without VAPID keys).
  const orgId = organization.id;
  const orgName = organization.name;
  const body = post.body;
  after(async () => {
    try {
      const app = await appService.getChurchApp(orgId);
      if (!app?.enabled) return;
      await sendAppPush(orgId, {
        title: orgName,
        body: body.slice(0, 140) || "New announcement from your church",
        url: `/a/${app.publicAppId}`,
      });
    } catch (err) {
      console.error("Announcement push fan-out failed:", err);
    }
  });

  revalidatePath("/community");
  return { error: null };
}

/** Announcement photo upload (public storage — it renders in every member's feed). */
export async function uploadAnnouncementPhotoAction(formData: FormData): Promise<{ url: string } | { error: string }> {
  const organization = await getCurrentOrganization();
  if (!organization) return { error: "No organization" };
  await requireApp(organization.id, "app.manage");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo." };
  if (!PHOTO_CONTENT_TYPES.has(file.type)) return { error: "Photos must be PNG, JPEG, WebP, or GIF." };
  if (file.size > PHOTO_MAX_BYTES) return { error: "Photos are capped at 4 MB." };

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
    if (!host) return { error: "Could not determine the site URL for the photo." };
    url = `${h.get("x-forwarded-proto") ?? "http"}://${host}${url}`;
  }
  return { url };
}

/** Moderation: hide (or restore) any feed post. */
export async function setPostHiddenAction(postId: string, hidden: boolean): Promise<void> {
  const organization = await getCurrentOrganization();
  if (!organization) return;
  await requireApp(organization.id, "app.manage");

  const changed = await appFeedService.setPostHidden(organization.id, postId, hidden);
  if (!changed) return;
  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: hidden ? "app.post_hidden" : "app.post_unhidden",
    targetType: "AppPost",
    targetId: postId,
  });
  revalidatePath("/community");
}

// ---------------------------------------------------------------------------
// Livestream chat: roles, slow mode, moderation (docs/domain/app.md)
// ---------------------------------------------------------------------------

export async function assignChatRoleAction(formData: FormData): Promise<void> {
  const organization = await getCurrentOrganization();
  if (!organization) return;
  await requireApp(organization.id, "app.manage");
  const personId = String(formData.get("personId") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!personId || (role !== "HOST" && role !== "MODERATOR")) throw new Error("Pick a person and a role.");
  await livestreamChatService.assignChatRole(organization.id, personId, role);
  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "livestream_chat.role_assigned",
    targetType: "Person",
    targetId: personId,
    metadata: { role },
  });
  revalidatePath("/community");
}

export async function removeChatRoleAction(personId: string): Promise<void> {
  const organization = await getCurrentOrganization();
  if (!organization) return;
  await requireApp(organization.id, "app.manage");
  await livestreamChatService.removeChatRole(organization.id, personId);
  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "livestream_chat.role_removed",
    targetType: "Person",
    targetId: personId,
  });
  revalidatePath("/community");
}

export async function setChatSlowModeAction(formData: FormData): Promise<void> {
  const organization = await getCurrentOrganization();
  if (!organization) return;
  await requireApp(organization.id, "app.manage");
  const seconds = Number(formData.get("seconds") ?? 0);
  await livestreamChatService.setChatSlowMode(organization.id, Number.isFinite(seconds) ? seconds : 0);
  revalidatePath("/community");
}

export async function setChatMessageHiddenAction(messageId: string, hidden: boolean): Promise<void> {
  const organization = await getCurrentOrganization();
  if (!organization) return;
  await requireApp(organization.id, "app.manage");
  await livestreamChatService.setChatMessageHidden(organization.id, messageId, hidden);
  revalidatePath("/community");
}

/** Post into the livestream chat as the church (Team badge). */
export async function postStaffChatMessageAction(formData: FormData): Promise<void> {
  const organization = await getCurrentOrganization();
  if (!organization) return;
  await requireApp(organization.id, "app.manage");
  await livestreamChatService.postStaffChatMessage(organization.id, {
    displayName: organization.name,
    body: String(formData.get("body") ?? ""),
  });
  revalidatePath("/community");
}
