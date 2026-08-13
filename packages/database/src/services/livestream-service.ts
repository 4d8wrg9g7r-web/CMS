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

const HTTPS_URL = /^https:\/\/.+/;

/**
 * "I already have a stream": store the church's existing ingest credentials
 * (reference for the AV team) and the provider's watch/embed URL (what the
 * app and website actually display). Replaces any Cloudflare-managed input.
 */
export async function saveManualStream(
  organizationId: string,
  input: {
    playbackEmbedUrl?: string | null;
    rtmpsUrl?: string | null;
    rtmpsStreamKey?: string | null;
    srtUrl?: string | null;
    srtStreamId?: string | null;
    srtPassphrase?: string | null;
  },
) {
  const clean = (v: string | null | undefined, max = 500) => {
    const t = v?.trim() ?? "";
    return t ? t.slice(0, max) : null;
  };
  const playbackEmbedUrl = clean(input.playbackEmbedUrl, 1000);
  if (playbackEmbedUrl && !HTTPS_URL.test(playbackEmbedUrl)) {
    throw new Error("The watch URL must start with https://");
  }
  const rtmpsUrl = clean(input.rtmpsUrl);
  const srtUrl = clean(input.srtUrl);
  if (rtmpsUrl && !/^rtmps?:\/\//.test(rtmpsUrl)) throw new Error("The RTMPS server should start with rtmps://");
  if (srtUrl && !/^srt:\/\//.test(srtUrl)) throw new Error("The SRT URL should start with srt://");
  if (!playbackEmbedUrl && !rtmpsUrl && !srtUrl) {
    throw new Error("Enter a watch URL or at least one set of stream credentials.");
  }

  const data = {
    mode: "MANUAL",
    liveInputId: null,
    playbackEmbedUrl,
    rtmpsUrl,
    rtmpsStreamKey: clean(input.rtmpsStreamKey),
    srtUrl,
    srtStreamId: clean(input.srtStreamId),
    srtPassphrase: clean(input.srtPassphrase),
  };
  const existing = await tenantDb.livestreamConfig.findFirst({ where: { organizationId } });
  if (!existing) {
    return tenantDb.livestreamConfig.create({ data: { organizationId, ...data } });
  }
  await tenantDb.livestreamConfig.updateMany({ where: { id: existing.id, organizationId }, data });
  return getLivestreamConfig(organizationId);
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
    return tenantDb.livestreamConfig.create({ data: { organizationId, mode: "CLOUDFLARE", cfAccountId, cfApiToken: token } });
  }
  if (existing.mode !== "CLOUDFLARE" && !token) {
    throw new Error("An API token is required to connect Cloudflare Stream.");
  }
  await tenantDb.livestreamConfig.updateMany({
    where: { id: existing.id, organizationId },
    data: { mode: "CLOUDFLARE", cfAccountId, ...(token ? { cfApiToken: token } : {}) },
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
