import { upload } from "@vercel/blob/client";
import type { MediaCollection } from "@cms/database";
import { mediaContentTypesFor, mediaMaxBytesFor, mediaSizeMessage, mediaTypeMessage } from "./media-rules";

export type UploadMode = "blob" | "direct";

/**
 * Browser-side media upload (client components only). mode "blob" (production):
 * straight to Blob storage via the client-upload token flow — no serverless
 * request-size ceiling. mode "direct" (local dev, no Blob store): POST the file
 * body to the route, which writes via local storage. The mode is decided
 * server-side (lib/upload-mode.ts) and passed down as a prop. Throws with a
 * user-facing message on validation failure; callers then register the
 * returned URL through registerMediaAssetAction (which re-validates).
 */
export async function uploadMediaFile(
  collection: MediaCollection,
  file: File,
  mode: UploadMode,
  onProgress?: (percentage: number) => void,
): Promise<string> {
  if (!mediaContentTypesFor(collection).includes(file.type)) throw new Error(mediaTypeMessage(collection));
  if (file.size > mediaMaxBytesFor(collection)) throw new Error(mediaSizeMessage(collection));

  const route = `/api/uploads/media?collection=${collection}`;
  if (mode === "blob") {
    try {
      const blob = await upload(`${collection}/${file.name}`, file, {
        access: "public",
        handleUploadUrl: route,
        contentType: file.type,
        onUploadProgress: ({ percentage }) => onProgress?.(Math.round(percentage)),
      });
      return blob.url;
    } catch (err) {
      // A response-parsing failure inside the blob client (SyntaxError) is
      // unreadable to users; its own BlobError messages are worth keeping.
      if (err instanceof SyntaxError) {
        throw new Error("The storage service returned an unreadable response — please try again.");
      }
      throw err;
    }
  }

  // Local dev (no Blob store): send the file body straight to the route.
  const fd = new FormData();
  fd.set("file", file);
  const res = await fetch(`${route}&dev=1`, { method: "POST", body: fd });
  const text = await res.text();
  let data: { url?: string; error?: string } = {};
  try {
    data = JSON.parse(text) as { url?: string; error?: string };
  } catch {
    throw new Error(`Upload failed (HTTP ${res.status}) — please try again.`);
  }
  if (!res.ok || !data.url) {
    if (data.error === "bad_type") throw new Error(mediaTypeMessage(collection));
    if (data.error === "too_large") throw new Error(mediaSizeMessage(collection));
    throw new Error(data.error ?? "Upload failed");
  }
  return data.url;
}
