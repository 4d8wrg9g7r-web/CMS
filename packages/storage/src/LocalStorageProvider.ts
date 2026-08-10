import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { extensionForContentType } from "./content-type";
import type { SaveFileInput, SaveFileResult, StorageProvider } from "./StorageProvider";

/**
 * Local-disk fallback for environments with no BLOB_READ_WRITE_TOKEN (plain `next
 * dev` without `vercel env pull`, CI, etc.) -- see VercelBlobStorageProvider for the
 * real provider used whenever that token is present. Saves under `${publicDir}/uploads/`
 * so Next.js serves the result as a static asset; not suitable for any deployment
 * with an ephemeral/read-only filesystem (serverless functions).
 */
export class LocalStorageProvider implements StorageProvider {
  constructor(
    private readonly publicDir: string,
    private readonly publicUrlPrefix = "/uploads",
  ) {}

  async saveFile(input: SaveFileInput): Promise<SaveFileResult> {
    const extension = extensionForContentType(input.contentType, input.fileName);
    const fileName = `${randomUUID()}${extension}`;
    const orgDir = path.join(this.publicDir, "uploads", input.organizationId);

    await mkdir(orgDir, { recursive: true });
    await writeFile(path.join(orgDir, fileName), input.data);

    return { url: `${this.publicUrlPrefix}/${input.organizationId}/${fileName}` };
  }
}
