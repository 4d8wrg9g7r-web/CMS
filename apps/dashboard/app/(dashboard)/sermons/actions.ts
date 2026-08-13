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

// ---------------------------------------------------------------------------
// Sermon detail: edit, custom links, documents, audio
// ---------------------------------------------------------------------------

import path from "node:path";
import { getStorageProvider } from "@cms/storage";
import { headers } from "next/headers";

const DOC_MAX_BYTES = 15 * 1024 * 1024; // 15 MB — sermon notes, slides
const DOC_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
]);
const AUDIO_MAX_BYTES = 200 * 1024 * 1024; // 200 MB — a full-length message
const AUDIO_CONTENT_TYPES = new Set(["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/ogg", "audio/wav"]);

async function absolutize(url: string): Promise<string> {
  if (!url.startsWith("/")) return url;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) throw new Error("Could not determine the site URL.");
  return `${h.get("x-forwarded-proto") ?? "http"}://${host}${url}`;
}

/** Public storage: sermon media is congregation-facing by design. */
async function savePublic(organizationId: string, file: File): Promise<string> {
  const saved = await getStorageProvider(path.join(process.cwd(), "public")).saveFile({
    organizationId,
    fileName: file.name,
    contentType: file.type,
    data: Buffer.from(await file.arrayBuffer()),
  });
  return absolutize(saved.url);
}

export async function updateSermonAction(sermonId: string, _prev: SermonFormState, formData: FormData): Promise<SermonFormState> {
  const organization = await getCurrentOrganization();
  if (!organization) return { error: "No organization" };
  await requireApp(organization.id, "sermon.manage");

  const dateRaw = String(formData.get("preachedAt") ?? "");
  const preachedAt = dateRaw ? new Date(`${dateRaw}T12:00:00Z`) : new Date();
  if (Number.isNaN(preachedAt.getTime())) return { error: "Pick a valid date." };

  // Links arrive as parallel field arrays from the editor rows.
  const labels = formData.getAll("linkLabel").map(String);
  const urls = formData.getAll("linkUrl").map(String);
  const links = labels.map((label, i) => ({ label, url: urls[i] ?? "" })).filter((l) => l.label.trim() || l.url.trim());

  const existing = await sermonService.getSermon(organization.id, sermonId);
  if (!existing) return { error: "Sermon not found." };

  try {
    await sermonService.updateSermon(organization.id, sermonId, {
      title: String(formData.get("title") ?? ""),
      speaker: String(formData.get("speaker") ?? ""),
      series: String(formData.get("series") ?? ""),
      passage: String(formData.get("passage") ?? ""),
      description: String(formData.get("description") ?? ""),
      videoUrl: String(formData.get("videoUrl") ?? ""),
      audioUrl: existing.audioUrl,
      artworkUrl: existing.artworkUrl,
      links,
      preachedAt,
    });
    const actor = await getCurrentUser();
    await auditService.recordAuditEvent({
      organizationId: organization.id,
      actorUserId: actor?.id,
      action: "sermon.updated",
      targetType: "Sermon",
      targetId: sermonId,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the sermon" };
  }

  revalidatePath(`/sermons/${sermonId}`);
  revalidatePath("/sermons");
  return { error: null };
}

export async function uploadSermonDocumentAction(sermonId: string, formData: FormData): Promise<void> {
  const organization = await getCurrentOrganization();
  if (!organization) return;
  await requireApp(organization.id, "sermon.manage");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a document.");
  if (file.size > DOC_MAX_BYTES) throw new Error("Documents are capped at 15 MB.");
  if (!DOC_CONTENT_TYPES.has(file.type)) throw new Error("Documents must be PDF, Word, PowerPoint, or plain text.");

  const url = await savePublic(organization.id, file);
  const doc = await sermonService.addSermonDocument(organization.id, sermonId, {
    name: file.name,
    url,
    contentType: file.type,
    sizeBytes: file.size,
  });
  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "sermon.document_added",
    targetType: "Sermon",
    targetId: sermonId,
    metadata: { name: doc.name },
  });
  revalidatePath(`/sermons/${sermonId}`);
}

export async function removeSermonDocumentAction(sermonId: string, documentId: string): Promise<void> {
  const organization = await getCurrentOrganization();
  if (!organization) return;
  await requireApp(organization.id, "sermon.manage");
  const removed = await sermonService.removeSermonDocument(organization.id, documentId);
  if (removed) {
    const actor = await getCurrentUser();
    await auditService.recordAuditEvent({
      organizationId: organization.id,
      actorUserId: actor?.id,
      action: "sermon.document_removed",
      targetType: "Sermon",
      targetId: sermonId,
    });
  }
  revalidatePath(`/sermons/${sermonId}`);
}

export async function uploadSermonAudioAction(sermonId: string, formData: FormData): Promise<void> {
  const organization = await getCurrentOrganization();
  if (!organization) return;
  await requireApp(organization.id, "sermon.manage");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose an audio file.");
  if (file.size > AUDIO_MAX_BYTES) throw new Error("Audio is capped at 200 MB.");
  if (!AUDIO_CONTENT_TYPES.has(file.type)) throw new Error("Audio must be MP3, M4A, AAC, OGG, or WAV.");

  const url = await savePublic(organization.id, file);
  const updated = await sermonService.setSermonMedia(organization.id, sermonId, { audioUrl: url });
  if (updated) {
    const actor = await getCurrentUser();
    await auditService.recordAuditEvent({
      organizationId: organization.id,
      actorUserId: actor?.id,
      action: "sermon.audio_set",
      targetType: "Sermon",
      targetId: sermonId,
    });
  }
  revalidatePath(`/sermons/${sermonId}`);
}

export async function removeSermonAudioAction(sermonId: string): Promise<void> {
  const organization = await getCurrentOrganization();
  if (!organization) return;
  await requireApp(organization.id, "sermon.manage");
  await sermonService.setSermonMedia(organization.id, sermonId, { audioUrl: null });
  revalidatePath(`/sermons/${sermonId}`);
}

// ---------------------------------------------------------------------------
// Self-hosted video (docs/domain/app.md "Self-hosted media")
// ---------------------------------------------------------------------------

import { mediaJobService } from "@cms/database";

/**
 * Attach an uploaded video file to the sermon and queue the media worker's
 * audio extraction (it only fills audioUrl when the sermon has none, so a
 * manually uploaded audio file is never clobbered).
 */
export async function attachSermonVideoAction(sermonId: string, url: string): Promise<void> {
  const organization = await getCurrentOrganization();
  if (!organization) return;
  await requireApp(organization.id, "sermon.manage");
  const clean = url.trim();
  if (!/^https?:\/\//.test(clean) || clean.length > 1000) throw new Error("Bad video URL.");

  const updated = await sermonService.setSermonMedia(organization.id, sermonId, { videoFileUrl: clean });
  if (!updated) throw new Error("Sermon not found.");
  await mediaJobService.queueMediaJob(organization.id, { sermonId, kind: "EXTRACT_AUDIO", sourceUrl: clean });

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "sermon.video_uploaded",
    targetType: "Sermon",
    targetId: sermonId,
  });
  revalidatePath(`/sermons/${sermonId}`);
  revalidatePath("/sermons");
}

export async function removeSermonVideoAction(sermonId: string): Promise<void> {
  const organization = await getCurrentOrganization();
  if (!organization) return;
  await requireApp(organization.id, "sermon.manage");
  await sermonService.setSermonMedia(organization.id, sermonId, { videoFileUrl: null });
  await mediaJobService.cancelJobsForSermon(organization.id, sermonId);
  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "sermon.video_removed",
    targetType: "Sermon",
    targetId: sermonId,
  });
  revalidatePath(`/sermons/${sermonId}`);
}
