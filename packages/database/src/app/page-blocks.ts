import type { AppTabKind } from "./manifest";
import { APP_TAB_KINDS } from "./manifest";

/**
 * Custom app pages (docs/domain/app.md): the church's own screens, composed from
 * blocks — custom graphics (optionally clickable), headings, text, buttons.
 * Every link declares a target:
 *   - `tab`      → switch to a built-in app tab (web: tab link; native: navigate)
 *   - `inapp`    → open inside the app (web: same tab; native: in-app browser)
 *   - `external` → leave the app (web: new tab; native: system browser)
 * Untrusted JSON from the studio; validateAppPageBlocks is the single gate,
 * text renders as text, URLs restricted to http(s).
 */

export type AppLinkTarget =
  | { kind: "tab"; tab: AppTabKind }
  | { kind: "inapp"; url: string }
  | { kind: "external"; url: string };

export type AppPageBlock =
  | { type: "image"; url: string; alt: string; link: AppLinkTarget | null }
  | { type: "heading"; text: string }
  | { type: "text"; text: string }
  | { type: "button"; label: string; target: AppLinkTarget }
  | { type: "divider" };

export const MAX_PAGE_BLOCKS = 30;

const HTTP_URL = /^https?:\/\/[^\s"'<>]+$/i;

function validateTarget(input: unknown): { ok: true; target: AppLinkTarget } | { ok: false; error: string } {
  const raw = input as { kind?: unknown; tab?: unknown; url?: unknown } | null;
  if (!raw || typeof raw !== "object") return { ok: false, error: "The link needs a destination." };
  if (raw.kind === "tab") {
    const tab = raw.tab as string;
    if (!(APP_TAB_KINDS as readonly string[]).includes(tab)) return { ok: false, error: "Unknown app tab for the link." };
    return { ok: true, target: { kind: "tab", tab: tab as AppTabKind } };
  }
  if (raw.kind === "inapp" || raw.kind === "external") {
    const url = typeof raw.url === "string" ? raw.url.trim() : "";
    if (!HTTP_URL.test(url)) return { ok: false, error: "Links need an http(s) URL." };
    return { ok: true, target: { kind: raw.kind, url } };
  }
  return { ok: false, error: "The link needs a destination." };
}

export type PageBlocksValidation = { ok: true; blocks: AppPageBlock[] } | { ok: false; error: string };

export function validateAppPageBlocks(input: unknown): PageBlocksValidation {
  if (!Array.isArray(input) || input.length === 0) return { ok: false, error: "Add at least one block." };
  if (input.length > MAX_PAGE_BLOCKS) return { ok: false, error: `At most ${MAX_PAGE_BLOCKS} blocks per page.` };

  const blocks: AppPageBlock[] = [];
  for (const raw of input) {
    const block = raw as { type?: unknown; url?: unknown; alt?: unknown; text?: unknown; label?: unknown; link?: unknown; target?: unknown };
    if (!block || typeof block !== "object") return { ok: false, error: "A block is malformed." };
    switch (block.type) {
      case "image": {
        const url = typeof block.url === "string" ? block.url.trim() : "";
        if (!HTTP_URL.test(url) && !url.startsWith("/")) {
          return { ok: false, error: "Image blocks need an uploaded graphic." };
        }
        let link: AppLinkTarget | null = null;
        if (block.link) {
          const validated = validateTarget(block.link);
          if (!validated.ok) return validated;
          link = validated.target;
        }
        blocks.push({ type: "image", url, alt: typeof block.alt === "string" ? block.alt : "", link });
        break;
      }
      case "heading": {
        const text = typeof block.text === "string" ? block.text.trim() : "";
        if (!text) return { ok: false, error: "Heading blocks need text." };
        blocks.push({ type: "heading", text: text.slice(0, 120) });
        break;
      }
      case "text": {
        const text = typeof block.text === "string" ? block.text.trim() : "";
        if (!text) return { ok: false, error: "Text blocks need content." };
        blocks.push({ type: "text", text: text.slice(0, 2000) });
        break;
      }
      case "button": {
        const label = typeof block.label === "string" ? block.label.trim() : "";
        if (!label || label.length > 40) return { ok: false, error: "Button blocks need a label (max 40 characters)." };
        const validated = validateTarget(block.target);
        if (!validated.ok) return validated;
        blocks.push({ type: "button", label, target: validated.target });
        break;
      }
      case "divider":
        blocks.push({ type: "divider" });
        break;
      default:
        return { ok: false, error: "Unknown block type." };
    }
  }
  return { ok: true, blocks };
}

/**
 * Best-effort embed URL for the livestream tab: YouTube/Vimeo watch URLs become
 * iframe-embeddable player URLs; anything unrecognized returns null (the tab
 * falls back to an open-in-browser button).
 */
export function toEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = parsed.pathname.slice(1).split("/")[0];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsed.pathname === "/watch") {
        const id = parsed.searchParams.get("v");
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
      if (parsed.pathname.startsWith("/embed/")) return url;
      if (parsed.pathname.startsWith("/live/")) {
        const id = parsed.pathname.split("/")[2];
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
      return null;
    }
    if (host === "vimeo.com") {
      const id = parsed.pathname.slice(1).split("/")[0] ?? "";
      return /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
    }
    if (host === "player.vimeo.com") return url;
    return null;
  } catch {
    return null;
  }
}
