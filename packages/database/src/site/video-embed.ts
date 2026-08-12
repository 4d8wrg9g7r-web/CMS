/**
 * Turn a pasted sermon video URL into an embeddable player URL, or null when
 * the link isn't a known embeddable host. Pure and defensive: anything that
 * doesn't parse as an http(s) URL on a recognized host with a well-formed
 * video id is rejected, so arbitrary strings can never become iframe sources.
 * YouTube embeds use the privacy-enhanced youtube-nocookie.com host.
 */

const YOUTUBE_ID = /^[\w-]{6,20}$/;
const VIMEO_ID = /^\d{6,12}$/;

export function videoEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    // /watch?v=ID, /shorts/ID, /live/ID, /embed/ID
    const fromQuery = parsed.pathname === "/watch" ? parsed.searchParams.get("v") : null;
    const fromPath = /^\/(?:shorts|live|embed)\/([^/]+)$/.exec(parsed.pathname)?.[1] ?? null;
    const id = fromQuery ?? fromPath;
    return id && YOUTUBE_ID.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "youtu.be") {
    const id = parsed.pathname.slice(1);
    return YOUTUBE_ID.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const match = /^\/(?:video\/)?(\d+)$/.exec(parsed.pathname);
    const id = match?.[1] ?? null;
    return id && VIMEO_ID.test(id) ? `https://player.vimeo.com/video/${id}` : null;
  }
  return null;
}
