import type { PrivateStorageProvider } from "./PrivateStorageProvider";
import { sanitizeStorageKey } from "./PrivateStorageProvider";
import { EMPTY_PAYLOAD_HASH, sha256Hex, signRequest } from "./sigv4";

/**
 * S3-compatible private object storage (Cloudflare R2, AWS S3, MinIO) behind the
 * PrivateStorageProvider seam (docs/domain/files.md). Path-style addressing
 * (endpoint/bucket/key) so R2 and MinIO work unchanged; requests signed with the
 * in-repo SigV4 signer; the bucket stays fully private — every download still
 * flows through the authorizing app route, exactly like the local provider.
 */
export interface S3Config {
  /** e.g. https://<account-id>.r2.cloudflarestorage.com or https://s3.us-east-1.amazonaws.com */
  endpoint: string;
  bucket: string;
  /** R2 uses "auto". */
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export class S3PrivateStorageProvider implements PrivateStorageProvider {
  constructor(private readonly config: S3Config) {}

  private url(key: string): URL {
    const safe = sanitizeStorageKey(key);
    const base = this.config.endpoint.replace(/\/+$/, "");
    // Sanitized keys are [A-Za-z0-9._-] segments — already URI-safe verbatim.
    return new URL(`${base}/${this.config.bucket}/${safe}`);
  }

  private headers(method: string, url: URL, payloadHash: string): Record<string, string> {
    return signRequest({
      method,
      url,
      region: this.config.region,
      service: "s3",
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      payloadHash,
      now: new Date(),
    });
  }

  async put(key: string, data: Buffer): Promise<void> {
    const url = this.url(key);
    const response = await fetch(url, {
      method: "PUT",
      headers: this.headers("PUT", url, sha256Hex(data)),
      body: new Uint8Array(data),
    });
    if (!response.ok) {
      throw new Error(`S3 put failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
    }
  }

  async get(key: string): Promise<Buffer | null> {
    const url = this.url(key);
    const response = await fetch(url, {
      method: "GET",
      headers: this.headers("GET", url, EMPTY_PAYLOAD_HASH),
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`S3 get failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    const url = this.url(key);
    const response = await fetch(url, {
      method: "DELETE",
      headers: this.headers("DELETE", url, EMPTY_PAYLOAD_HASH),
    });
    // Deleting a missing object is a no-op, matching the local provider.
    if (!response.ok && response.status !== 404) {
      throw new Error(`S3 delete failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
    }
  }
}

/** Reads STORAGE_S3_* env config; null when not (fully) configured. */
export function s3ConfigFromEnv(env: NodeJS.ProcessEnv = process.env): S3Config | null {
  const endpoint = env.STORAGE_S3_ENDPOINT;
  const bucket = env.STORAGE_S3_BUCKET;
  const accessKeyId = env.STORAGE_S3_ACCESS_KEY_ID;
  const secretAccessKey = env.STORAGE_S3_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return { endpoint, bucket, region: env.STORAGE_S3_REGION || "auto", accessKeyId, secretAccessKey };
}
