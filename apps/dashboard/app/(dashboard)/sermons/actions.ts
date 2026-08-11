"use server";

import { revalidatePath } from "next/cache";
import { auditService, sermonService } from "@cms/database";
import { getCurrentOrganization, getCurrentUser } from "../../../lib/session";
import { requireApp } from "../../../lib/app-access";

export interface SermonFormState {
  error: string | null;
}

export async function createSermonAction(_prev: SermonFormState, formData: FormData): Promise<SermonFormState> {
  const organization = await getCurrentOrganization();
  if (!organization) return { error: "No organization" };
  await requireApp(organization.id, "sermon.manage");

  const dateRaw = String(formData.get("preachedAt") ?? "");
  const preachedAt = dateRaw ? new Date(`${dateRaw}T12:00:00Z`) : new Date();
  if (Number.isNaN(preachedAt.getTime())) return { error: "Pick a valid date." };

  try {
    const sermon = await sermonService.createSermon(organization.id, {
      title: String(formData.get("title") ?? ""),
      speaker: String(formData.get("speaker") ?? ""),
      series: String(formData.get("series") ?? ""),
      passage: String(formData.get("passage") ?? ""),
      description: String(formData.get("description") ?? ""),
      videoUrl: String(formData.get("videoUrl") ?? ""),
      preachedAt,
    });
    const actor = await getCurrentUser();
    await auditService.recordAuditEvent({
      organizationId: organization.id,
      actorUserId: actor?.id,
      action: "sermon.created",
      targetType: "Sermon",
      targetId: sermon.id,
      metadata: { title: sermon.title },
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the sermon" };
  }

  revalidatePath("/sermons");
  return { error: null };
}

export async function archiveSermonAction(sermonId: string): Promise<void> {
  const organization = await getCurrentOrganization();
  if (!organization) return;
  await requireApp(organization.id, "sermon.manage");

  const archived = await sermonService.archiveSermon(organization.id, sermonId);
  if (!archived) return;
  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "sermon.archived",
    targetType: "Sermon",
    targetId: sermonId,
  });
  revalidatePath("/sermons");
}
