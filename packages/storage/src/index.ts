export type { SaveFileInput, SaveFileResult, StorageProvider } from "./StorageProvider";
export { LocalStorageProvider } from "./LocalStorageProvider";
export { VercelBlobStorageProvider } from "./VercelBlobStorageProvider";
export type { PrivateStorageProvider } from "./PrivateStorageProvider";
export {
  LocalPrivateStorageProvider,
  getPrivateStorageProvider,
  sanitizeStorageKey,
} from "./PrivateStorageProvider";

import type { StorageProvider } from "./StorageProvider";
import { LocalStorageProvider } from "./LocalStorageProvider";
import { VercelBlobStorageProvider } from "./VercelBlobStorageProvider";

let cachedProvider: StorageProvider | null = null;

/**
 * Same real-vs-mock branch as getAIProvider()/getResourceProvider(): a real
 * BLOB_READ_WRITE_TOKEN (set automatically once a Vercel Blob store is linked to the
 * project) switches to VercelBlobStorageProvider; otherwise falls back to
 * LocalStorageProvider for plain local dev. `publicDir` is only used by the local
 * fallback -- Blob storage needs no filesystem path.
 */
export function getStorageProvider(publicDir: string): StorageProvider {
  if (cachedProvider) return cachedProvider;
  cachedProvider = process.env.BLOB_READ_WRITE_TOKEN ? new VercelBlobStorageProvider() : new LocalStorageProvider(publicDir);
  return cachedProvider;
}
