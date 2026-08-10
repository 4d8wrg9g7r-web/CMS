/**
 * The file-storage seam (mirrors packages/email/src/EmailProvider.ts's role for the
 * email seam). LocalStorageProvider is the only implementation today -- see
 * getStorageProvider() in index.ts -- but every call site goes through this interface
 * so a real object-storage provider (S3, R2, Vercel Blob) can be swapped in later
 * without touching callers.
 */
export interface SaveFileInput {
  organizationId: string;
  /** Original file name, used only to derive an extension -- never trusted as a path. */
  fileName: string;
  contentType: string;
  data: Buffer;
}

export interface SaveFileResult {
  /** Publicly servable URL (relative or absolute) for the saved file. */
  url: string;
}

export interface StorageProvider {
  saveFile(input: SaveFileInput): Promise<SaveFileResult>;
}
