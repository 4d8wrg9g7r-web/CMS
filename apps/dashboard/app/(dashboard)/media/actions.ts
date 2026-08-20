"use server";

import { revalidatePath } from "next/cache";
import { auditService, eventService, isMediaCollection, mediaService, sermonService, type MediaCollection } from "@cms/database";
import { getCurrentOrganization, getCurrentUser } from "../../../lib/session";
import { requireApp } from "../../../lib/app-access";
import { requireEvents } from "../../../lib/events-access";
import { fail, ok, type ActionResult } from "../../../lib/action-result";
import { mediaContentTypesFor, mediaMaxBytesFor, mediaSizeMessage, mediaTypeMessage } from "../../../lib/media-rules";

/** Managing a collection carries the same responsibility as the module it feeds. */
async function requireCollectionManage(organizationId: string, collection: MediaCollection): Promise<void> {
  if (collection === "event") await requireEvents(organizationId, "event.manage");
  else if (collection === "sermon") await requireApp(organizationId, "sermon.manage");
  else await requireApp(organizationId, "app.manage");
}

/** Validation problem the user can fix — callers turn it into an inline error, never a crash. */
class UploadValidationError extends Error {}

export type UploadedMediaMeta = {
  url: string;
  name: string;
  contentType: string;
  sizeBytes: number;
};

/**
 * File bytes go browser → storage via /api/uploads/media (Vercel caps request
 * bodies at ~4.5 MB, so they can never ride through a server action). These
 * register actions validate the claim and record the asset. The URL must point
 * at storage we control — Blob storage in production, this host in local dev.
 */
function checkUploadedMeta(collection: MediaCollection, meta: UploadedMediaMeta): string | null {
  let parsed: URL;
  try {
    parsed = new URL(meta.url);
  } catch {
    return "Bad upload URL.";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "Bad upload URL.";
  if (process.env.BLOB_READ_WRITE_TOKEN && !parsed.hostname.endsWith(".blob.vercel-storage.com")) {
    return "Bad upload URL.";
  }
  if (!mediaContentTypesFor(collection).includes(meta.contentType)) return mediaTypeMessage(collection);
  if (!Number.isFinite(meta.sizeBytes) || meta.sizeBytes <= 0 || meta.sizeBytes > mediaMaxBytesFor(collection)) {
    return mediaSizeMessage(collection);
  }
  return null;
}

function assetNameFrom(meta: UploadedMediaMeta): string {
  return meta.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 200) || "Upload";
}

export async function registerMediaAssetAction(collection: string, meta: UploadedMediaMeta): Promise<ActionResult> {
  const organization = await getCurrentOrganization();
  if (!organization) return { ok: false, formError: "No organization." };
  if (!isMediaCollection(collection)) return fail("Unknown collection.");
  await requireCollectionManage(organization.id, collection);

  const problem = checkUploadedMeta(collection, meta);
  if (problem) return fail(problem);
  const asset = await mediaService.createMediaAsset(organization.id, {
    collection,
    name: assetNameFrom(meta),
    url: meta.url,
    contentType: meta.contentType,
    sizeBytes: meta.sizeBytes,
  });

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "media.uploaded",
    targetType: "MediaAsset",
    targetId: asset.id,
    metadata: { collection, name: asset.name },
  });
  revalidatePath("/files");
  revalidatePath("/sermons");
  revalidatePath("/events");
  return ok(`Uploaded "${asset.name}"`);
}

export async function deleteMediaAssetAction(assetId: string): Promise<ActionResult> {
  const organization = await getCurrentOrganization();
  if (!organization) return { ok: false, formError: "No organization." };
  const asset = await mediaService.getMediaAsset(organization.id, assetId);
  if (!asset || !isMediaCollection(asset.collection)) return { ok: false, formError: "That file is already gone." };
  await requireCollectionManage(organization.id, asset.collection);

  await mediaService.deleteMediaAsset(organization.id, assetId);
  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "media.deleted",
    targetType: "MediaAsset",
    targetId: assetId,
    metadata: { collection: asset.collection, name: asset.name },
  });
  revalidatePath("/files");
  revalidatePath("/sermons");
  revalidatePath("/events");
  return ok(`Deleted "${asset.name}"`);
}

// ---------------------------------------------------------------------------
// Attach graphics to items (Event.imageUrl / Sermon.artworkUrl). `url` is
// either a library asset's URL, or empty to remove the graphic.
// ---------------------------------------------------------------------------

function cleanImageUrl(raw: FormDataEntryValue | null): string | null {
  const url = String(raw ?? "").trim();
  if (!url) return null;
  if (!/^https?:\/\//.test(url)) throw new UploadValidationError("Bad image URL.");
  return url.slice(0, 1000);
}

export async function setEventImageAction(eventId: string, formData: FormData): Promise<ActionResult> {
  const organization = await getCurrentOrganization();
  if (!organization) return fail("No organization.");
  await requireEvents(organization.id, "event.manage");
  let url: string | null;
  try {
    url = cleanImageUrl(formData.get("url"));
  } catch (err) {
    if (err instanceof UploadValidationError) return fail(err.message);
    throw err;
  }
  await eventService.setEventImage(organization.id, eventId, url);
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
  return ok();
}

export async function setSermonArtworkAction(sermonId: string, formData: FormData): Promise<ActionResult> {
  const organization = await getCurrentOrganization();
  if (!organization) return fail("No organization.");
  await requireApp(organization.id, "sermon.manage");
  let url: string | null;
  try {
    url = cleanImageUrl(formData.get("url"));
  } catch (err) {
    if (err instanceof UploadValidationError) return fail(err.message);
    throw err;
  }
  await sermonService.setSermonMedia(organization.id, sermonId, { artworkUrl: url });
  revalidatePath(`/sermons/${sermonId}`);
  revalidatePath("/sermons");
  return ok();
}

/** Upload straight from an item's graphic picker: register in the library, then attach. */
export async function registerAndAttachGraphicAction(
  target: { kind: "event" | "sermon"; id: string },
  meta: UploadedMediaMeta,
): Promise<ActionResult> {
  const organization = await getCurrentOrganization();
  if (!organization) return fail("No organization.");
  const collection: MediaCollection = target.kind === "event" ? "event" : "sermon";
  await requireCollectionManage(organization.id, collection);

  const problem = checkUploadedMeta(collection, meta);
  if (problem) return fail(problem);
  await mediaService.createMediaAsset(organization.id, {
    collection,
    name: assetNameFrom(meta),
    url: meta.url,
    contentType: meta.contentType,
    sizeBytes: meta.sizeBytes,
  });

  if (target.kind === "event") {
    await eventService.setEventImage(organization.id, target.id, meta.url);
    revalidatePath(`/events/${target.id}`);
    revalidatePath("/events");
  } else {
    await sermonService.setSermonMedia(organization.id, target.id, { artworkUrl: meta.url });
    revalidatePath(`/sermons/${target.id}`);
    revalidatePath("/sermons");
  }
  revalidatePath("/files");
  revalidatePath("/sermons");
  revalidatePath("/events");
  return ok("Graphic uploaded to your media library");
}
