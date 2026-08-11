import { describe, expect, it } from "vitest";
import {
  blocksToPlainText,
  renderBlocksEmailBody,
  renderBlocksEmailHtml,
  validateEmailBlocks,
  MAX_EMAIL_BLOCKS,
} from "../blocks";

const VALID = [
  { type: "image", url: "https://cdn.example.org/header.png", alt: "Fall series" },
  { type: "heading", text: "This month", level: 1 },
  { type: "text", markdown: "We are **glad** you're here." },
  { type: "button", label: "RSVP now", url: "https://example.org/rsvp" },
  { type: "divider" },
];

describe("validateEmailBlocks", () => {
  it("accepts a full valid layout", () => {
    const result = validateEmailBlocks(VALID);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.blocks).toHaveLength(5);
  });

  it("rejects empty, oversized, unknown, and malformed blocks", () => {
    expect(validateEmailBlocks([]).ok).toBe(false);
    expect(validateEmailBlocks(Array.from({ length: MAX_EMAIL_BLOCKS + 1 }, () => ({ type: "divider" }))).ok).toBe(false);
    expect(validateEmailBlocks([{ type: "video", url: "https://x" }]).ok).toBe(false);
    expect(validateEmailBlocks([{ type: "heading", text: "  " }]).ok).toBe(false);
  });

  it("restricts image and button URLs to http(s)", () => {
    expect(validateEmailBlocks([{ type: "image", url: "javascript:alert(1)", alt: "" }]).ok).toBe(false);
    expect(validateEmailBlocks([{ type: "button", label: "Go", url: "data:text/html,x" }]).ok).toBe(false);
  });
});

describe("renderBlocksEmailBody", () => {
  it("renders each block type with escaped content", () => {
    const result = validateEmailBlocks([
      { type: "image", url: "https://cdn.example.org/a.png", alt: '"><script>' },
      { type: "heading", text: "<b>Hi</b>", level: 2 },
      { type: "button", label: "Click <me>", url: "https://example.org" },
    ]);
    if (!result.ok) throw new Error("invalid");
    const html = renderBlocksEmailBody(result.blocks);
    expect(html).toContain('<img src="https://cdn.example.org/a.png"');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;b&gt;Hi&lt;/b&gt;");
    expect(html).toContain("Click &lt;me&gt;");
    expect(html).toContain('<a href="https://example.org"');
  });

  it("renders markdown text blocks through the escaping renderer", () => {
    const result = validateEmailBlocks([{ type: "text", markdown: "**bold** and <script>x</script>" }]);
    if (!result.ok) throw new Error("invalid");
    const html = renderBlocksEmailBody(result.blocks);
    expect(html).toContain("<strong>bold</strong>");
    expect(html).not.toContain("<script>");
  });
});

describe("full document + plain text", () => {
  it("wraps blocks in the 600px shell with the org footer", () => {
    const result = validateEmailBlocks(VALID);
    if (!result.ok) throw new Error("invalid");
    const html = renderBlocksEmailHtml(result.blocks, { organizationName: "Victory Church" });
    expect(html).toContain("max-width:600px");
    expect(html).toContain("Victory Church");
  });

  it("derives a readable plain-text alternative", () => {
    const result = validateEmailBlocks(VALID);
    if (!result.ok) throw new Error("invalid");
    const text = blocksToPlainText(result.blocks);
    expect(text).toContain("[Image: Fall series]");
    expect(text).toContain("This month");
    expect(text).toContain("RSVP now: https://example.org/rsvp");
  });
});
