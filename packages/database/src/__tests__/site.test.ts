import { describe, expect, it } from "vitest";
import { defaultSiteConfig, parseSiteConfig, DEFAULT_ACCENT, DEFAULT_FONT, SITE_FONTS } from "../site/site-config";
import {
  blankSection,
  pageSlugError,
  parseSection,
  parseSections,
  victoryTemplate,
  SECTION_KINDS,
  SECTION_KIND_LABELS,
} from "../site/site-sections";
import { TENANT_SCOPED_MODELS } from "../tenant-guard";

describe("site config", () => {
  it("falls back to defaults on junk input", () => {
    const cfg = parseSiteConfig(null, "Victory Church");
    expect(cfg.siteName).toBe("Victory Church");
    expect(cfg.theme.accentColor).toBe(DEFAULT_ACCENT);
    expect(cfg.theme.font).toBe(DEFAULT_FONT);
    expect(cfg.serviceTimes.length).toBeGreaterThan(0);
  });

  it("accepts only curated font ids — a raw font-family string never survives", () => {
    expect(parseSiteConfig({ theme: { font: "classic" } }, "x").theme.font).toBe("classic");
    expect(parseSiteConfig({ theme: { font: "'Comic Sans MS', cursive" } }, "x").theme.font).toBe(DEFAULT_FONT);
    expect(parseSiteConfig({ theme: { font: 42 } }, "x").theme.font).toBe(DEFAULT_FONT);
    // Configs written before fonts existed keep working.
    expect(parseSiteConfig({ theme: { accentColor: "#AA33ff" } }, "x").theme.font).toBe(DEFAULT_FONT);
  });

  it("heading font pairs with the body font unless set independently", () => {
    // Configs written before heading fonts existed: headings follow the body.
    expect(parseSiteConfig({ theme: { font: "classic" } }, "x").theme.headingFont).toBe("classic");
    // Independent pair.
    const paired = parseSiteConfig({ theme: { font: "modern", headingFont: "elegant" } }, "x").theme;
    expect(paired.font).toBe("modern");
    expect(paired.headingFont).toBe("elegant");
    // Junk heading ids fall back to the body font.
    expect(parseSiteConfig({ theme: { font: "friendly", headingFont: "cursive" } }, "x").theme.headingFont).toBe("friendly");
  });

  it("every curated font resolves to a non-empty system stack", () => {
    for (const font of Object.values(SITE_FONTS)) {
      expect(font.stack.length).toBeGreaterThan(10);
      expect(font.label.length).toBeGreaterThan(0);
    }
  });

  it("keeps valid values and rejects a malformed accent color", () => {
    const cfg = parseSiteConfig(
      {
        siteName: "Grace Fellowship",
        tagline: "A church for the city",
        theme: { accentColor: "javascript:alert(1)" },
        contact: { address: "1 Main St", phone: "(555) 000-1111", email: "hi@grace.org" },
        serviceTimes: [{ label: "Sunday", time: "9 & 11 AM" }, { label: "", time: "" }],
      },
      "fallback",
    );
    expect(cfg.siteName).toBe("Grace Fellowship");
    expect(cfg.theme.accentColor).toBe(DEFAULT_ACCENT);
    expect(cfg.contact.phone).toBe("(555) 000-1111");
    expect(cfg.serviceTimes).toEqual([{ label: "Sunday", time: "9 & 11 AM" }]);
  });

  it("accepts a valid hex accent", () => {
    const cfg = parseSiteConfig({ theme: { accentColor: "#AA33ff" } }, "x");
    expect(cfg.theme.accentColor).toBe("#AA33ff");
  });

  it("defaultSiteConfig round-trips through parse", () => {
    const cfg = defaultSiteConfig("Test Church");
    expect(parseSiteConfig(cfg, "other")).toEqual(cfg);
  });
});

describe("site sections", () => {
  it("drops unknown kinds and caps the array", () => {
    const sections = parseSections([
      { kind: "hero", headline: "Hi" },
      { kind: "notAThing" },
      "garbage",
      { kind: "markdown", body: "text" },
    ]);
    expect(sections.map((s) => s.kind)).toEqual(["hero", "markdown"]);
  });

  it("coerces field junk instead of crashing", () => {
    const hero = parseSection({ kind: "hero", headline: 42, ctas: [{ label: "Go", href: "/x" }, { label: "" }] });
    expect(hero).toEqual({ kind: "hero", headline: "", subheadline: "", imageUrl: "", ctas: [{ label: "Go", href: "/x" }] });
  });

  it("clamps live-section limits", () => {
    const events = parseSection({ kind: "events", limit: 999 });
    expect(events).toMatchObject({ kind: "events", limit: 12 });
    const sermons = parseSection({ kind: "sermons", limit: -5 });
    expect(sermons).toMatchObject({ kind: "sermons", limit: 1 });
  });

  it("blankSection produces a valid block for every kind", () => {
    for (const kind of SECTION_KINDS) {
      const s = blankSection(kind);
      expect(s.kind).toBe(kind);
      expect(SECTION_KIND_LABELS[kind]).toBeTruthy();
    }
  });

  it("validates page slugs", () => {
    expect(pageSlugError("plan-a-visit")).toBeNull();
    expect(pageSlugError("home")).toBeNull();
    expect(pageSlugError("Bad Slug")).toBeTruthy();
    expect(pageSlugError("-x")).toBeTruthy();
    expect(pageSlugError("")).toBeTruthy();
  });
});

describe("victory template", () => {
  const pages = victoryTemplate("Victory Church");

  it("has home plus the expected nav pages", () => {
    expect(pages.map((p) => p.slug)).toEqual([
      "home",
      "plan-a-visit",
      "about",
      "ministries",
      "events",
      "watch",
      "giving",
    ]);
    const home = pages[0]!;
    expect(home.inNav).toBe(false);
    expect(pages.slice(1).every((p) => p.inNav)).toBe(true);
  });

  it("every template section survives parseSections unchanged (template is valid by construction)", () => {
    for (const page of pages) {
      expect(parseSections(page.sections)).toEqual(page.sections);
    }
  });

  it("substitutes the church name and defaults it when blank", () => {
    const hero = pages[0]!.sections[0]!;
    expect(hero.kind).toBe("hero");
    expect(JSON.stringify(pages)).toContain("Victory Church");
    expect(JSON.stringify(victoryTemplate("  "))).toContain("Our Church");
  });

  it("home page leads with hero and includes live content sections", () => {
    const kinds = pages[0]!.sections.map((s) => s.kind);
    expect(kinds[0]).toBe("hero");
    expect(kinds).toContain("events");
    expect(kinds).toContain("sermons");
    expect(kinds).toContain("give");
  });
});

describe("tenant guard registration", () => {
  it("Site and SitePage are tenant-scoped", () => {
    expect(TENANT_SCOPED_MODELS.has("Site")).toBe(true);
    expect(TENANT_SCOPED_MODELS.has("SitePage")).toBe(true);
  });
});
