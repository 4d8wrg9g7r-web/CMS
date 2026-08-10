import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Private-file seam (BLUEPRINT §41): bytes live here, metadata/access policy live in
 * PostgreSQL (the File model), and NOTHING here is publicly addressable -- downloads go
 * through an authorizing route on every request. Distinct from StorageProvider, which
 * exists for genuinely public assets (logos). Filesystem implementation for local/dev;
 * an S3/R2/private-Blob adapter swaps in behind the same interface (§54).
 */
export interface PrivateStorageProvider {
  put(key: string, data: Buffer): Promise<void>;
  /** Returns null when the key does not exist. */
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

/**
 * Normalize a storage key to a safe relative path: allow only
 * `segment/segment/...` of [A-Za-z0-9._-], reject anything that could traverse.
 */
export function sanitizeStorageKey(key: string): string {
  const segments = key.split("/").filter(Boolean);
  if (segments.length === 0) throw new Error("Empty storage key");
  for (const segment of segments) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment) || segment.includes("..")) {
      throw new Error(`Unsafe storage key segment: ${segment}`);
    }
  }
  return segments.join("/");
}

export class LocalPrivateStorageProvider implements PrivateStorageProvider {
  constructor(private readonly baseDir: string) {}

  private resolve(key: string): string {
    const safe = sanitizeStorageKey(key);
    const resolved = path.resolve(this.baseDir, safe);
    const base = path.resolve(this.baseDir);
    if (!resolved.startsWith(base + path.sep)) throw new Error("Storage key escapes base directory");
    return resolved;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const filePath = this.resolve(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.resolve(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
}

let cachedPrivateProvider: PrivateStorageProvider | null = null;

/**
 * Env-switched like getStorageProvider(): local filesystem under a NON-public directory
 * by default (CMS_PRIVATE_STORAGE_DIR overrides). A cloud private-bucket provider
 * slots in here when configured.
 */
export function getPrivateStorageProvider(): PrivateStorageProvider {
  if (cachedPrivateProvider) return cachedPrivateProvider;
  const baseDir = process.env.CMS_PRIVATE_STORAGE_DIR || ".private-storage";
  cachedPrivateProvider = new LocalPrivateStorageProvider(baseDir);
  return cachedPrivateProvider;
}
