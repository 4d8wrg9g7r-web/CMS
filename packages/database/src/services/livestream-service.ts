import { tenantDb } from "../client";

/**
 * Livestream ingest config (docs/domain/app.md): bring-your-own Cloudflare
 * Stream account. The dashboard creates a live input through Cloudflare's API
 * and stores the returned RTMPS/SRT credentials here; the playback embed URL
 * is what churches paste into the app's livestream tab and website. The API
 * token is write-only at the UI — reads only ever reveal its presence.
 */

export interface LiveInputDetails {
  liveInputId: string;
  rtmpsUrl: string | null;
  rtmpsStreamKey: string | null;
  srtUrl: string | null;
  srtStreamId: string | null;
  srtPassphrase: string | null;
  playbackEmbedUrl: string | null;
}

export async function getLivestreamConfig(organizationId: string) {
  return tenantDb.livestreamConfig.findFirst({ where: { organizationId } });
}

/** Save credentials; a blank token keeps the stored one (write-only field). */
export async function saveLivestreamCredentials(
  organizationId: string,
  input: { cfAccountId: string; cfApiToken?: string | null },
) {
  const cfAccountId = input.cfAccountId.trim();
  if (!cfAccountId) throw new Error("The Cloudflare account ID is required.");
  const token = input.cfApiToken?.trim() || null;

  const existing = await tenantDb.livestreamConfig.findFirst({ where: { organizationId } });
  if (!existing) {
    if (!token) throw new Error("An API token is required to connect Cloudflare Stream.");
    return tenantDb.livestreamConfig.create({ data: { organizationId, cfAccountId, cfApiToken: token } });
  }
  await tenantDb.livestreamConfig.updateMany({
    where: { id: existing.id, organizationId },
    data: { cfAccountId, ...(token ? { cfApiToken: token } : {}) },
  });
  return getLivestreamConfig(organizationId);
}

export async function saveLiveInput(organizationId: string, details: LiveInputDetails) {
  const result = await tenantDb.livestreamConfig.updateMany({
    where: { organizationId },
    data: { ...details },
  });
  return result.count > 0;
}

/** Forget the live input (credentials stay) so a fresh one can be created. */
export async function clearLiveInput(organizationId: string) {
  const result = await tenantDb.livestreamConfig.updateMany({
    where: { organizationId },
    data: {
      liveInputId: null,
      rtmpsUrl: null,
      rtmpsStreamKey: null,
      srtUrl: null,
      srtStreamId: null,
      srtPassphrase: null,
      playbackEmbedUrl: null,
    },
  });
  return result.count > 0;
}

export async function disconnectLivestream(organizationId: string) {
  const result = await tenantDb.livestreamConfig.deleteMany({ where: { organizationId } });
  return result.count > 0;
}
