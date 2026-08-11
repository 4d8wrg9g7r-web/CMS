"use server";

import path from "node:path";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { appFeedService, auditService } from "@cms/database";
import { getStorageProvider } from "@cms/storage";
import { getCurrentOrganization, getCurrentUser } from "../../../lib/session";
import { requireApp } from "../../../lib/app-access";

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
