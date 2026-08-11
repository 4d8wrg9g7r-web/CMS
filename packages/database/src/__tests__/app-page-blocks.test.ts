import { describe, expect, it } from "vitest";
import { toEmbedUrl, validateAppPageBlocks, MAX_PAGE_BLOCKS } from "../app/page-blocks";
import { validateAppManifest } from "../app/manifest";

const VALID = [
  { type: "image", url: "https://cdn.example.org/banner.png", alt: "Visit us", link: { kind: "tab", tab: "events" } },
  { type: "heading", text: "Plan your visit" },
  { type: "text", text: "We meet Sundays at 10am." },
  { type: "button", label: "Get directions", target: { kind: "external", url: "https://maps.example.org/x" } },
  { type: "button", label: "Watch online", target: { kind: "inapp", url: "https://youtube.com/@x/live" } },
  { type: "divider" },
];

describe("validateAppPageBlocks", () => {
  it("accepts a full page with all three link-target kinds", () => {
    const result = validateAppPageBlocks(VALID);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.blocks).toHaveLength(6);
  });

  it("rejects empty, oversized, unknown, and malformed blocks", () => {
    expect(validateAppPageBlocks([]).ok).toBe(false);
    expect(validateAppPageBlocks(Array.from({ length: MAX_PAGE_BLOCKS + 1 }, () => ({ type: "divider" }))).ok).toBe(false);
    expect(validateAppPageBlocks([{ type: "video" }]).ok).toBe(false);
    expect(validateAppPageBlocks([{ type: "heading", text: " " }]).ok).toBe(false);
  });

  it("validates link targets: unknown tabs, bad kinds, non-http URLs", () => {
    expect(validateAppPageBlocks([{ type: "button", label: "Go", target: { kind: "tab", tab: "podcast" } }]).ok).toBe(false);
    expect(validateAppPageBlocks([{ type: "button", label: "Go", target: { kind: "popup", url: "https://x.org" } }]).ok).toBe(false);
    expect(validateAppPageBlocks([{ type: "button", label: "Go", target: { kind: "external", url: "javascript:x" } }]).ok).toBe(false);
    const clickableImage = validateAppPageBlocks([
      { type: "image", url: "/uploads/o/x.png", alt: "", link: { kind: "inapp", url: "https://give.example.org" } },
    ]);
    expect(clickableImage.ok).toBe(true);
  });
});

describe("manifest v2 tabs", () => {
  const base = { appName: "Victory", themeColor: "#2a78d6", logoUrl: null, welcome: "", givingUrl: null };

  it("accepts livestream, giving, and page tabs", () => {
    const result = validateAppManifest({
      ...base,
      tabs: [
        { kind: "home" },
        { kind: "livestream", url: "https://youtube.com/watch?v=abc" },
        { kind: "giving" },
        { kind: "page", pageId: "pg1", label: "Visit Us" },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("clamps stored manifests to 5 tabs instead of rejecting", () => {
    const result = validateAppManifest({
      ...base,
      tabs: [
        { kind: "home" },
        { kind: "events" },
        { kind: "sermons" },
        { kind: "groups" },
        { kind: "forms" },
        { kind: "link", label: "Watch", url: "https://x.org" },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.manifest.tabs).toHaveLength(5);
  });

  it("rejects page tabs without a page and livestream without a URL", () => {
    expect(validateAppManifest({ ...base, tabs: [{ kind: "home" }, { kind: "page", pageId: "", label: "X" }] }).ok).toBe(false);
    expect(validateAppManifest({ ...base, tabs: [{ kind: "home" }, { kind: "livestream", url: "notaurl" }] }).ok).toBe(false);
  });
});

describe("toEmbedUrl", () => {
  it("converts YouTube and Vimeo URLs to embeddable players", () => {
    expect(toEmbedUrl("https://www.youtube.com/watch?v=abc123")).toBe("https://www.youtube.com/embed/abc123");
    expect(toEmbedUrl("https://youtu.be/xyz")).toBe("https://www.youtube.com/embed/xyz");
    expect(toEmbedUrl("https://www.youtube.com/live/livestreamid")).toBe("https://www.youtube.com/embed/livestreamid");
    expect(toEmbedUrl("https://vimeo.com/123456")).toBe("https://player.vimeo.com/video/123456");
    expect(toEmbedUrl("https://player.vimeo.com/video/1")).toBe("https://player.vimeo.com/video/1");
  });

  it("returns null for unembeddable URLs", () => {
    expect(toEmbedUrl("https://church.example.org/live")).toBeNull();
    expect(toEmbedUrl("https://www.youtube.com/@channel")).toBeNull();
    expect(toEmbedUrl("not a url")).toBeNull();
  });
});
