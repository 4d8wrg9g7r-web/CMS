/**
 * Site-wide config stored in Site.config (docs/domain/website.md) — theme,
 * contact block, and service times shared by the header/footer and the
 * visit/serviceTimes sections. Pure validation + defaults; unit-tested.
 */

export interface SiteContact {
  address: string;
  phone: string;
  email: string;
}

export interface ServiceTime {
  /** e.g. "Sunday Worship" */
  label: string;
  /** e.g. "Sundays · 10:00 AM" — free text, churches phrase these differently */
  time: string;
}

/**
 * Curated site typefaces — system font stacks only, so the public page loads
 * nothing external and can never be pointed at an arbitrary font URL.
 */
export const SITE_FONTS = {
  modern: {
    label: "Modern",
    stack: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
  classic: {
    label: "Classic",
    stack: "Georgia, 'Times New Roman', Times, serif",
  },
  elegant: {
    label: "Elegant",
    stack: "'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif",
  },
  friendly: {
    label: "Friendly",
    stack: "'Trebuchet MS', Verdana, 'Segoe UI', sans-serif",
  },
} as const;

export type SiteFontId = keyof typeof SITE_FONTS;

export const DEFAULT_FONT: SiteFontId = "modern";

export interface SiteTheme {
  /** Hex accent used for buttons, links, thermometers. */
  accentColor: string;
  /** Body typeface — one of the curated SITE_FONTS ids, never a raw font-family string. */
  font: SiteFontId;
  /** Heading typeface (site name, hero headline, section titles) — same curated set. */
  headingFont: SiteFontId;
}

export interface SiteConfig {
  /** Site display name — defaults to the organization name, editable. */
  siteName: string;
  tagline: string;
  theme: SiteTheme;
  contact: SiteContact;
  serviceTimes: ServiceTime[];
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const DEFAULT_ACCENT = "#1d4ed8";

export function defaultSiteConfig(siteName: string): SiteConfig {
  return {
    siteName,
    tagline: "",
    theme: { accentColor: DEFAULT_ACCENT, font: DEFAULT_FONT, headingFont: DEFAULT_FONT },
    contact: { address: "", phone: "", email: "" },
    serviceTimes: [{ label: "Sunday Worship", time: "Sundays · 10:00 AM" }],
  };
}

function str(value: unknown, max = 500): string {
  return typeof value === "string" ? value.slice(0, max).trim() : "";
}

/**
 * Coerce untrusted JSON (from the DB or a form) into a well-formed SiteConfig.
 * Never throws — unknown/malformed fields fall back to defaults so a bad write
 * can't take the public site down.
 */
export function parseSiteConfig(raw: unknown, fallbackSiteName: string): SiteConfig {
  const base = defaultSiteConfig(fallbackSiteName);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;

  const theme = (r.theme ?? {}) as Record<string, unknown>;
  const contact = (r.contact ?? {}) as Record<string, unknown>;
  const accent = str(theme.accentColor, 7);

  const serviceTimes = Array.isArray(r.serviceTimes)
    ? r.serviceTimes
        .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
        .map((t) => ({ label: str(t.label, 120), time: str(t.time, 120) }))
        .filter((t) => t.label.length > 0 || t.time.length > 0)
        .slice(0, 12)
    : base.serviceTimes;

  return {
    siteName: str(r.siteName, 120) || base.siteName,
    tagline: str(r.tagline, 200),
    theme: (() => {
      const fontId = (v: unknown): SiteFontId | null => (typeof v === "string" && v in SITE_FONTS ? (v as SiteFontId) : null);
      const font = fontId(theme.font) ?? DEFAULT_FONT;
      return {
        accentColor: HEX_COLOR.test(accent) ? accent : DEFAULT_ACCENT,
        font,
        // Configs written before heading fonts existed keep headings matching the body.
        headingFont: fontId(theme.headingFont) ?? font,
      };
    })(),
    contact: {
      address: str(contact.address, 200),
      phone: str(contact.phone, 40),
      email: str(contact.email, 200),
    },
    serviceTimes,
  };
}
