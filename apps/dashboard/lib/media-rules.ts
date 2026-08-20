import type { MediaCollection } from "@cms/database";

/**
 * Shared upload rules for media collections — one source of truth for the
 * token route, the register actions, and the client-side pre-checks (the
 * client checks first so oversized files fail with a message instead of a
 * doomed upload).
 */
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB — a graphic, not a photo archive
export const IMAGE_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

// The general Files library takes more than graphics: documents and audio too.
export const LIBRARY_MAX_BYTES = 25 * 1024 * 1024;
export const LIBRARY_CONTENT_TYPES = [
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
];

export function mediaContentTypesFor(collection: MediaCollection): string[] {
  return collection === "library" ? LIBRARY_CONTENT_TYPES : IMAGE_CONTENT_TYPES;
}

export function mediaMaxBytesFor(collection: MediaCollection): number {
  return collection === "library" ? LIBRARY_MAX_BYTES : IMAGE_MAX_BYTES;
}

export function mediaSizeMessage(collection: MediaCollection): string {
  return collection === "library" ? "Files can be up to 25 MB." : "Images can be up to 10 MB.";
}

export function mediaTypeMessage(collection: MediaCollection): string {
  return collection === "library"
    ? "That file type isn't supported here."
    : "Upload a PNG, JPEG, WebP, or GIF image.";
}
