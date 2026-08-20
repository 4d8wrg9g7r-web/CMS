"use server";

import path from "node:path";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getStorageProvider } from "@cms/storage";
import { auditService, eventService, isMediaCollection, mediaService, sermonService, type MediaCollection } from "@cms/database";
import { getCurrentOrganization, getCurrentUser } from "../../../lib/session";
import { requireApp } from "../../../lib/app-access";
import { requireEvents } from "../../../lib/events-access";
import { fail, invalid, ok, type ActionResult } from "../../../lib/action-result";

const IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB — a graphic, not a photo archive
const IMAGE_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
// The general Files library takes more than graphics: documents and audio too.
const LIBRARY_MAX_BYTES = 25 * 1024 * 1024;
const LIBRARY_CONTENT_TYPES = new Set([
  ...IMAGE_CONTENT_TYPES,
  "image/svg+xml",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "audio/mpeg",
  "audio/mp4",
]);

/** Managing a collection carries the same responsibility as the module it feeds. */
async function requireCollectionManage(organizationId: string, collection: MediaCollection): Promise<void> {
  if (collection === "event") await requireEvents(organizationId, "event.manage");
  else if (collection === "sermon") await requireApp(organizationId, "sermon.manage");
  else await requireApp(organizationId, "app.manage");
}

async function absolutize(url: string): Promise<string> {
  if (!url.startsWith("/")) return url;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) throw new Error("Could not determine the site URL.");
  return `${h.get("x-forwarded-proto") ?? "http"}://${host}${url}`;
}

/** Validation problem the user can fix — callers turn it into an inline error, never a crash. */
class UploadValidationError extends Error {}

async function saveImage(organizationId: string, file: File, collection: MediaCollection = "sermon"): Promise<string> {
  if (collection === "library") {
    if (!LIBRARY_CONTENT_TYPES.has(file.type)) throw new UploadValidationError("That file type isn't supported here.");
    if (file.size > LIBRARY_MAX_BYTES) throw new UploadValidationError("Files can be up to 25 MB.");
  } else if (!IMAGE_CONTENT_TYPES.has(file.type)) throw new UploadValidationError("Upload a PNG, JPEG, WebP, or GIF image.");
  else if (file.size > IMAGE_MAX_BYTES) throw new UploadValidationError("Images can be up to 10 MB.");
  const saved = await getStorageProvider(path.join(process.cwd(), "public")).saveFile({
    organizationId,
    fileName: file.name,
    contentType: file.type,
    data: Buffer.from(await file.arrayBuffer()),
  });
  return absolutize(saved.url);
}

export async function uploadMediaAssetAction(formData: FormData): Promise<ActionResult> {
  const organization = await getCurrentOrganization();
  if (!organization) return { ok: false, formError: "No organization." };
  const collection = formData.get("collection");
  if (!isMediaCollection(collection)) return fail("Unknown collection.");
  await requireCollectionManage(organization.id, collection);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return invalid({ file: "Choose a file first, then hit Upload." });
  let url: string;
  try {
    url = await saveImage(organization.id, file, collection);
  } catch (err) {
    if (err instanceof UploadValidationError) return invalid({ file: err.message });
    throw err;
  }
  const asset = await mediaService.createMediaAsset(organization.id, {
    collection,
    name: file.name.replace(/\.[a-z0-9]+$/i, ""),
    url,
    contentType: file.type,
    sizeBytes: file.size,
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

/** Upload straight from an item's graphic picker: store in the library, then attach. */
export async function uploadAndAttachAction(
  target: { kind: "event" | "sermon"; id: string },
  formData: FormData,
): Promise<ActionResult> {
  const organization = await getCurrentOrganization();
  if (!organization) return fail("No organization.");
  const collection: MediaCollection = target.kind === "event" ? "event" : "sermon";
  await requireCollectionManage(organization.id, collection);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Choose an image to upload.");
  let url: string;
  try {
    url = await saveImage(organization.id, file);
  } catch (err) {
    if (err instanceof UploadValidationError) return fail(err.message);
    throw err;
  }
  await mediaService.createMediaAsset(organization.id, {
    collection,
    name: file.name.replace(/\.[a-z0-9]+$/i, ""),
    url,
    contentType: file.type,
    sizeBytes: file.size,
  });

  if (target.kind === "event") {
    await eventService.setEventImage(organization.id, target.id, url);
    revalidatePath(`/events/${target.id}`);
    revalidatePath("/events");
  } else {
    await sermonService.setSermonMedia(organization.id, target.id, { artworkUrl: url });
    revalidatePath(`/sermons/${target.id}`);
    revalidatePath("/sermons");
  }
  revalidatePath("/files");
  revalidatePath("/sermons");
  revalidatePath("/events");
  return ok("Graphic uploaded to your media library");
}
