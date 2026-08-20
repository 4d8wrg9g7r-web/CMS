import { upload } from "@vercel/blob/client";
import type { MediaCollection } from "@cms/database";
import { mediaContentTypesFor, mediaMaxBytesFor, mediaSizeMessage, mediaTypeMessage } from "./media-rules";

/**
 * Browser-side media upload (client components only). Production: straight to
 * Blob storage via the token flow — no serverless request-size ceiling. Local
 * dev: direct POST to the same route, which writes via local storage. Throws
 * with a user-facing message on validation failure; callers then register the
 * returned URL through registerMediaAssetAction (which re-validates).
 */
export async function uploadMediaFile(
  collection: MediaCollection,
  file: File,
  onProgress?: (percentage: number) => void,
): Promise<string> {
  if (!mediaContentTypesFor(collection).includes(file.type)) throw new Error(mediaTypeMessage(collection));
  if (file.size > mediaMaxBytesFor(collection)) throw new Error(mediaSizeMessage(collection));

  const route = `/api/uploads/media?collection=${collection}`;
  const probe = (await (await fetch(route)).json()) as { mode?: string };
  if (probe.mode === "blob") {
    const blob = await upload(`${collection}/${file.name}`, file, {
      access: "public",
      handleUploadUrl: route,
      contentType: file.type,
      onUploadProgress: ({ percentage }) => onProgress?.(Math.round(percentage)),
    });
    return blob.url;
  }

  // Local dev (no Blob store): send the file body straight to the route.
  const fd = new FormData();
  fd.set("file", file);
  const res = await fetch(`${route}&dev=1`, { method: "POST", body: fd });
  const data = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !data.url) {
    if (data.error === "bad_type") throw new Error(mediaTypeMessage(collection));
    if (data.error === "too_large") throw new Error(mediaSizeMessage(collection));
    throw new Error(data.error ?? "Upload failed");
  }
  return data.url;
}
