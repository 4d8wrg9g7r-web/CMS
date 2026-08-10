import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { extensionForContentType } from "./content-type";
import type { SaveFileInput, SaveFileResult, StorageProvider } from "./StorageProvider";

/**
 * Real object storage, used whenever BLOB_READ_WRITE_TOKEN is set (see
 * getStorageProvider() in index.ts) -- required in any deployment with an
 * ephemeral/read-only filesystem (e.g. Vercel serverless functions), where
 * LocalStorageProvider's disk writes wouldn't survive a cold start or redeploy.
 */
export class VercelBlobStorageProvider implements StorageProvider {
  async saveFile(input: SaveFileInput): Promise<SaveFileResult> {
    const extension = extensionForContentType(input.contentType, input.fileName);
    const pathname = `uploads/${input.organizationId}/${randomUUID()}${extension}`;

    const blob = await put(pathname, input.data, {
      access: "public",
      contentType: input.contentType,
      addRandomSuffix: false,
    });

    return { url: blob.url };
  }
}
