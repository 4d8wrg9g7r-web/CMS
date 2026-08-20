export type UploadMode = "blob" | "direct";

/**
 * Which path client-side uploads should take. Decided on the server (only it
 * can see BLOB_READ_WRITE_TOKEN) and passed to client components as a prop —
 * replacing the old GET "mode probe" request, whose unchecked res.json() was
 * a production failure point (a cached/empty response parsed as JSON blew up
 * with "Unexpected end of JSON input" before the upload even started).
 */
export function getUploadMode(): UploadMode {
  return process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "direct";
}
