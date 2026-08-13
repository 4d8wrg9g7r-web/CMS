/**
 * Cloudflare Stream live inputs (docs/domain/app.md "Livestream ingest").
 * Bring-your-own account: the church's API token needs the Stream:Edit
 * permission. One fetch per operation — no SDK dependency.
 */

export interface CreatedLiveInput {
  liveInputId: string;
  rtmpsUrl: string | null;
  rtmpsStreamKey: string | null;
  srtUrl: string | null;
  srtStreamId: string | null;
  srtPassphrase: string | null;
  playbackEmbedUrl: string | null;
}

interface CfLiveInput {
  uid?: string;
  rtmps?: { url?: string; streamKey?: string };
  srt?: { url?: string; streamId?: string; passphrase?: string };
  webRTCPlayback?: { url?: string };
}

/** The player iframe lives on the account's customer subdomain, which the API
 * only reveals inside the playback URLs — derive it from webRTCPlayback. */
function iframeFromPlayback(uid: string, webRtcPlaybackUrl: string | undefined): string | null {
  if (!webRtcPlaybackUrl) return null;
  try {
    const host = new URL(webRtcPlaybackUrl).hostname;
    return /^customer-[a-z0-9]+\.cloudflarestream\.com$/.test(host) ? `https://${host}/${uid}/iframe` : null;
  } catch {
    return null;
  }
}

export async function createLiveInput(
  cfAccountId: string,
  cfApiToken: string,
  name: string,
): Promise<CreatedLiveInput> {
  let res: Response;
  try {
    res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cfAccountId)}/stream/live_inputs`, {
      method: "POST",
      headers: { authorization: `Bearer ${cfApiToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        meta: { name },
        recording: { mode: "automatic" },
        // Watching the input's uid directly ("live playback") is what the
        // iframe URL relies on.
        deleteRecordingAfterDays: null,
      }),
    });
  } catch {
    throw new Error("Could not reach Cloudflare — check your network and try again.");
  }

  const data = (await res.json().catch(() => null)) as
    | { success?: boolean; result?: CfLiveInput; errors?: { message?: string }[] }
    | null;
  if (!res.ok || !data?.success || !data.result?.uid) {
    const detail = data?.errors?.[0]?.message;
    if (res.status === 401 || res.status === 403) {
      throw new Error("Cloudflare rejected the credentials — check the account ID and API token (needs Stream:Edit).");
    }
    throw new Error(detail ? `Cloudflare error: ${detail}` : "Cloudflare could not create the live input.");
  }

  const r = data.result;
  return {
    liveInputId: r.uid!,
    rtmpsUrl: r.rtmps?.url ?? null,
    rtmpsStreamKey: r.rtmps?.streamKey ?? null,
    srtUrl: r.srt?.url ?? null,
    srtStreamId: r.srt?.streamId ?? null,
    srtPassphrase: r.srt?.passphrase ?? null,
    playbackEmbedUrl: iframeFromPlayback(r.uid!, r.webRTCPlayback?.url),
  };
}
