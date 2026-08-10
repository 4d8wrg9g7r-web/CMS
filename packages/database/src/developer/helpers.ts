/**
 * Developer-platform crypto helpers (BLUEPRINT §42/§43). Web Crypto only (no
 * node:crypto) — this package's barrel export is reachable from the Edge-bundled
 * middleware (see website-service's generateToken note), and Web Crypto works in both
 * runtimes. Pure of Prisma; unit-tested.
 */

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(bytes: number): string {
  const raw = new Uint8Array(bytes);
  crypto.getRandomValues(raw);
  return [...raw].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const API_KEY_PREFIX = "cms_";

/** Mint a new API key. The plaintext is shown once; only the hash is stored. */
export async function generateApiKey(): Promise<{ key: string; hash: string; prefix: string }> {
  const key = `${API_KEY_PREFIX}${randomToken(24)}`;
  return { key, hash: await hashApiKey(key), prefix: key.slice(0, 8) + "…" };
}

export async function hashApiKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return toHex(digest);
}

/** Mint a webhook signing secret (`whsec_`-prefixed, shown to org admins). */
export function generateWebhookSecret(): string {
  return `whsec_${randomToken(24)}`;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message)));
}

/**
 * Sign a webhook body (§43): HMAC-SHA256 over `"<timestamp>.<body>"`, sent as
 * `X-CMS-Signature: t=<timestamp>,v1=<hex>`. Consumers recompute and compare, and
 * should reject stale timestamps to bound replay windows.
 */
export async function signWebhookPayload(secret: string, timestamp: string, body: string): Promise<string> {
  const signature = await hmacSha256Hex(secret, `${timestamp}.${body}`);
  return `t=${timestamp},v1=${signature}`;
}

/** Consumer-side verification helper (also used by tests). */
export async function verifyWebhookSignature(
  secret: string,
  header: string,
  body: string,
): Promise<boolean> {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const timestamp = parts.t;
  const provided = parts.v1;
  if (!timestamp || !provided) return false;
  const expected = await hmacSha256Hex(secret, `${timestamp}.${body}`);
  // Length-safe comparison; timing side-channels are out of scope for this helper's
  // consumer-side use.
  return expected.length === provided.length && expected === provided;
}
