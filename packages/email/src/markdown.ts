/**
 * Markdown → email HTML for newsletters/blasts (docs/domain/communications.md).
 * Hand-rolled subset — a markdown dependency would need an ADR for what is ~100
 * lines of pure, testable code (same reasoning as the CSV parser and SigV4).
 *
 * Security model: the ENTIRE input is HTML-escaped first, then a small whitelist
 * of markdown transforms is applied to the escaped text. Raw HTML in the input can
 * therefore never survive as markup, and link hrefs are restricted to http(s) and
 * mailto. Supported: # ## ### headings, **bold**, *italic*, [text](url), unordered
 * (- ) and ordered (1. ) lists, > blockquotes, --- rules, paragraphs, and hard
 * line breaks within a paragraph.
 */

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Inline transforms over already-escaped text: links, bold, italic. */
function inline(escaped: string): string {
  let out = escaped;
  // [text](url) — href must be http(s) or mailto; anything else renders as text.
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, href: string) => {
    if (!/^(https?:\/\/|mailto:)/i.test(href)) return match;
    return `<a href="${href}" style="color:#2a78d6;">${label}</a>`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return out;
}

const P_STYLE = 'style="margin:0 0 14px 0; line-height:1.6;"';

function renderBlock(block: string): string {
  const lines = block.split("\n");
  const first = lines[0] ?? "";

  if (/^---+\s*$/.test(first) && lines.length === 1) {
    return '<hr style="border:none; border-top:1px solid #e5e5e2; margin:20px 0;" />';
  }
  const heading = /^(#{1,3})\s+(.*)$/.exec(first);
  if (heading && lines.length === 1) {
    const level = heading[1]!.length;
    const sizes = ["22px", "18px", "16px"];
    return `<h${level} style="margin:22px 0 10px 0; font-size:${sizes[level - 1]}; line-height:1.3;">${inline(heading[2]!)}</h${level}>`;
  }
  if (lines.every((l) => /^-\s+/.test(l))) {
    const items = lines.map((l) => `<li style="margin:0 0 6px 0;">${inline(l.replace(/^-\s+/, ""))}</li>`).join("");
    return `<ul style="margin:0 0 14px 0; padding-left:22px; line-height:1.6;">${items}</ul>`;
  }
  if (lines.every((l) => /^\d+\.\s+/.test(l))) {
    const items = lines.map((l) => `<li style="margin:0 0 6px 0;">${inline(l.replace(/^\d+\.\s+/, ""))}</li>`).join("");
    return `<ol style="margin:0 0 14px 0; padding-left:22px; line-height:1.6;">${items}</ol>`;
  }
  if (lines.every((l) => /^&gt;\s?/.test(l))) {
    const inner = lines.map((l) => inline(l.replace(/^&gt;\s?/, ""))).join("<br />");
    return `<blockquote style="margin:0 0 14px 0; padding:2px 0 2px 14px; border-left:3px solid #d9d8d4; color:#52514e;">${inner}</blockquote>`;
  }
  return `<p ${P_STYLE}>${lines.map(inline).join("<br />")}</p>`;
}

/** Renders the body content only (no outer document) — testable core. */
export function markdownToEmailBody(markdown: string): string {
  return escapeHtml(markdown.replace(/\r\n/g, "\n").trim())
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(renderBlock)
    .join("\n");
}

/** Full email document: centered 600px column, system fonts, footer with org name. */
export function renderEmailHtml(markdown: string, opts: { organizationName: string }): string {
  const body = markdownToEmailBody(markdown);
  const footer = escapeHtml(opts.organizationName);
  return [
    '<!doctype html><html><body style="margin:0; padding:0; background:#f5f5f3;">',
    '<div style="max-width:600px; margin:0 auto; padding:28px 20px; background:#ffffff; font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif; color:#1b1b19; font-size:15px;">',
    body,
    `<p style="margin:28px 0 0 0; padding-top:14px; border-top:1px solid #e5e5e2; font-size:12px; color:#8a8985;">${footer}</p>`,
    "</div></body></html>",
  ].join("\n");
}
