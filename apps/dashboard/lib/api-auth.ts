import { NextRequest, NextResponse } from "next/server";
import { developerService } from "@cms/database";
import { checkRateLimit } from "./rate-limit";

/**
 * Public-API authentication (BLUEPRINT §42): `Authorization: Bearer cms_…` resolves to an
 * organization through the hash-only key store. Keys are org-scoped SERVER credentials
 * — they act as a trusted integration for the whole org (scoped OAuth is the deferred
 * path for user-authorized third parties). Rate limits are per-key (§42 tenant- and
 * principal-aware).
 */

export type ApiAuth = { organizationId: string; apiKeyId: string };

export async function authenticateApiRequest(
  req: NextRequest,
): Promise<{ ok: true; auth: ApiAuth } | { ok: false; response: NextResponse }> {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(cms_[A-Za-z0-9]+)$/);
  if (!match) {
    return {
      ok: false,
      response: NextResponse.json({ error: { code: "unauthorized", message: "Missing or malformed API key" } }, { status: 401 }),
    };
  }

  const resolved = await developerService.resolveApiKey(match[1]!);
  if (!resolved) {
    return {
      ok: false,
      response: NextResponse.json({ error: { code: "unauthorized", message: "Unknown or revoked API key" } }, { status: 401 }),
    };
  }

  const rate = checkRateLimit(`api-key:${resolved.apiKeyId}`, 120, 60_000);
  if (!rate.allowed) {
    return {
      ok: false,
      response: NextResponse.json({ error: { code: "rate_limited", message: "Too many requests" } }, { status: 429 }),
    };
  }

  return { ok: true, auth: resolved };
}
