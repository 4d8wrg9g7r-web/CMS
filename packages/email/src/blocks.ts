import { markdownToEmailBody } from "./markdown";

/**
 * Block-based email layout (docs/domain/communications.md) — the Mailchimp-style
 * building blocks behind the newsletter designer. Blocks arrive from the composer
 * as untrusted JSON: validateEmailBlocks is the single gate, every text field is
 * HTML-escaped at render time, and image/button URLs are restricted to http(s).
 * Text blocks reuse the escaping markdown renderer. Templates later = saved block
 * arrays; nothing here needs to change.
 */

export type EmailBlock =
  | { type: "image"; url: string; alt: string }
  | { type: "heading"; text: string; level: 1 | 2 }
  | { type: "text"; markdown: string }
  | { type: "button"; label: string; url: string }
  | { type: "divider" };

export const MAX_EMAIL_BLOCKS = 40;

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const HTTP_URL = /^https?:\/\/[^\s"'<>]+$/i;

export type BlocksValidation = { ok: true; blocks: EmailBlock[] } | { ok: false; error: string };

export function validateEmailBlocks(input: unknown): BlocksValidation {
  if (!Array.isArray(input) || input.length === 0) return { ok: false, error: "Add at least one content block." };
  if (input.length > MAX_EMAIL_BLOCKS) return { ok: false, error: `At most ${MAX_EMAIL_BLOCKS} blocks per email.` };

  const blocks: EmailBlock[] = [];
  for (const raw of input) {
    const block = raw as Partial<EmailBlock> & { type?: string };
    if (!block || typeof block !== "object") return { ok: false, error: "A block is malformed." };
    switch (block.type) {
      case "image": {
        const { url, alt } = block as { url?: unknown; alt?: unknown };
        if (typeof url !== "string" || !HTTP_URL.test(url)) {
          return { ok: false, error: "Image blocks need an http(s) image URL — upload one first." };
        }
        blocks.push({ type: "image", url, alt: typeof alt === "string" ? alt : "" });
        break;
      }
      case "heading": {
        const text = (block as { text?: unknown }).text;
        if (typeof text !== "string" || !text.trim()) return { ok: false, error: "Heading blocks need text." };
        const level = (block as { level?: unknown }).level === 2 ? 2 : 1;
        blocks.push({ type: "heading", text: text.trim(), level });
        break;
      }
      case "text": {
        const markdown = (block as { markdown?: unknown }).markdown;
        if (typeof markdown !== "string" || !markdown.trim()) return { ok: false, error: "Text blocks need content." };
        blocks.push({ type: "text", markdown });
        break;
      }
      case "button": {
        const { label, url } = block as { label?: unknown; url?: unknown };
        if (typeof label !== "string" || !label.trim()) return { ok: false, error: "Button blocks need a label." };
        if (typeof url !== "string" || !HTTP_URL.test(url)) {
          return { ok: false, error: "Button blocks need an http(s) link." };
        }
        blocks.push({ type: "button", label: label.trim(), url });
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

function renderBlock(block: EmailBlock): string {
  switch (block.type) {
    case "image":
      return `<img src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt)}" width="600" style="display:block; width:100%; max-width:600px; height:auto; border-radius:6px; margin:0 0 18px 0;" />`;
    case "heading": {
      const size = block.level === 1 ? "26px" : "20px";
      return `<h${block.level} style="margin:6px 0 14px 0; font-size:${size}; line-height:1.25;">${escapeHtml(block.text)}</h${block.level}>`;
    }
    case "text":
      return markdownToEmailBody(block.markdown);
    case "button":
      return [
        '<div style="margin:6px 0 20px 0;">',
        `<a href="${escapeHtml(block.url)}" style="display:inline-block; background:#2a78d6; color:#ffffff; text-decoration:none; font-weight:600; font-size:15px; padding:12px 26px; border-radius:8px;">${escapeHtml(block.label)}</a>`,
        "</div>",
      ].join("");
    case "divider":
      return '<hr style="border:none; border-top:1px solid #e5e5e2; margin:22px 0;" />';
  }
}

/** Body content only (no outer document) — used by the composer preview too. */
export function renderBlocksEmailBody(blocks: EmailBlock[]): string {
  return blocks.map(renderBlock).join("\n");
}

/** Full email document, same shell as renderEmailHtml. */
export function renderBlocksEmailHtml(blocks: EmailBlock[], opts: { organizationName: string }): string {
  const footer = escapeHtml(opts.organizationName);
  return [
    '<!doctype html><html><body style="margin:0; padding:0; background:#f5f5f3;">',
    '<div style="max-width:600px; margin:0 auto; padding:28px 20px; background:#ffffff; font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif; color:#1b1b19; font-size:15px;">',
    renderBlocksEmailBody(blocks),
    `<p style="margin:28px 0 0 0; padding-top:14px; border-top:1px solid #e5e5e2; font-size:12px; color:#8a8985;">${footer}</p>`,
    "</div></body></html>",
  ].join("\n");
}

/** Plain-text alternative derived from the blocks (stored as the Message body). */
export function blocksToPlainText(blocks: EmailBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "image":
          return block.alt ? `[Image: ${block.alt}]` : "[Image]";
        case "heading":
          return block.text;
        case "text":
          return block.markdown;
        case "button":
          return `${block.label}: ${block.url}`;
        case "divider":
          return "---";
      }
    })
    .join("\n\n");
}
