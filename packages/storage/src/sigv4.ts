import { createHash, createHmac } from "node:crypto";

/**
 * Hand-rolled AWS Signature Version 4 for S3-compatible object storage (R2, S3,
 * MinIO). Deliberately not an SDK dependency: the platform needs exactly three
 * operations (PUT/GET/DELETE object) over a stable, well-documented signing
 * algorithm — a full AWS SDK would be the Constitution's "new infrastructure
 * dependency" for ~80 lines of pure, test-vectored code (same reasoning as the
 * hand-rolled CSV parser). Verified against the official SigV4 example vectors
 * in the unit tests.
 */

export interface SignRequestInput {
  method: string;
  /** Absolute request URL; the path must already be URI-encoded per S3 rules. */
  url: URL;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Hex SHA-256 of the request payload (EMPTY_PAYLOAD_HASH for no body). */
  payloadHash: string;
  now: Date;
  /** Extra headers to sign (e.g. Range). Host is always included. */
  extraHeaders?: Record<string, string>;
}

export const EMPTY_PAYLOAD_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function amzTimestamp(now: Date): { amzDate: string; dateStamp: string } {
  const iso = now.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

/** Exposed for tests: the canonical request string per the SigV4 spec. */
export function canonicalRequest(input: SignRequestInput): string {
  const { amzDate } = amzTimestamp(input.now);
  const headers: Record<string, string> = {
    host: input.url.host,
    "x-amz-content-sha256": input.payloadHash,
    "x-amz-date": amzDate,
    ...Object.fromEntries(
      Object.entries(input.extraHeaders ?? {}).map(([k, v]) => [k.toLowerCase(), v.trim()]),
    ),
  };
  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name]}\n`).join("");
  const canonicalQuery = [...input.url.searchParams.entries()]
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .sort()
    .join("&");
  return [
    input.method.toUpperCase(),
    input.url.pathname || "/",
    canonicalQuery,
    canonicalHeaders,
    signedHeaderNames.join(";"),
    input.payloadHash,
  ].join("\n");
}

/** Exposed for tests: the string-to-sign derived from the canonical request. */
export function stringToSign(input: SignRequestInput): string {
  const { amzDate, dateStamp } = amzTimestamp(input.now);
  const scope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  return ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest(input))].join("\n");
}

/** Exposed for tests: the final hex signature. */
export function signature(input: SignRequestInput): string {
  const { dateStamp } = amzTimestamp(input.now);
  const kDate = hmac(`AWS4${input.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, input.region);
  const kService = hmac(kRegion, input.service);
  const kSigning = hmac(kService, "aws4_request");
  return createHmac("sha256", kSigning).update(stringToSign(input)).digest("hex");
}

/** Headers to attach to the request: Authorization + the signed x-amz-* pair. */
export function signRequest(input: SignRequestInput): Record<string, string> {
  const { amzDate, dateStamp } = amzTimestamp(input.now);
  const scope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const signedHeaderNames = [
    "host",
    "x-amz-content-sha256",
    "x-amz-date",
    ...Object.keys(input.extraHeaders ?? {}).map((k) => k.toLowerCase()),
  ]
    .sort()
    .join(";");
  return {
    ...input.extraHeaders,
    "x-amz-content-sha256": input.payloadHash,
    "x-amz-date": amzDate,
    Authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaderNames}, Signature=${signature(input)}`,
  };
}
