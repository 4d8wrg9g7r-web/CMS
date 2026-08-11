"use server";

import { revalidatePath } from "next/cache";
import { appFeedService, auditService } from "@cms/database";
import { getCurrentOrganization, getCurrentUser } from "../../../lib/session";
import { requireApp } from "../../../lib/app-access";

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
    post = await appFeedService.createChurchPost(organization.id, { body: String(formData.get("body") ?? "") });
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
