import path from "node:path";

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "image/gif": ".gif",
};

/** Derives a safe extension from the validated content type rather than trusting the caller-supplied file name. */
export function extensionForContentType(contentType: string, fallbackFileName: string): string {
  return EXTENSION_BY_CONTENT_TYPE[contentType] ?? path.extname(fallbackFileName);
}
