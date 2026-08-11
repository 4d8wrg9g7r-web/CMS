/**
 * Pure church-app manifest model (docs/domain/app.md). The manifest is what a
 * church designs in App Studio and what the public /a/<id> surface renders —
 * untrusted JSON with validateAppManifest as the single gate. Phase 1 targets
 * the installable web app; the same manifest later drives the native container
 * and white-label builds, so nothing here is web-specific.
 */

export const APP_TAB_KINDS = ["home", "events", "sermons", "groups", "forms", "giving"] as const;
export type AppTabKind = (typeof APP_TAB_KINDS)[number];

export type AppTab =
  | { kind: AppTabKind }
  | { kind: "link"; label: string; url: string }
  | { kind: "livestream"; url: string }
  | { kind: "page"; pageId: string; label: string };

export interface AppManifest {
  appName: string;
  /** Hex like #2a78d6 — header/tab bar + PWA theme_color. */
  themeColor: string;
  logoUrl: string | null;
  welcome: string;
  /** External giving page; the Give button shows only when set. */
  givingUrl: string | null;
  /** Community feed: whether signed-in members may post (default true). */
  allowMemberPosts: boolean;
  tabs: AppTab[];
}

/** The bottom bar holds exactly up to 5 tabs — the mobile-navigation sweet spot. */
export const MAX_APP_TABS = 5;

export const DEFAULT_APP_MANIFEST: AppManifest = {
  appName: "",
  themeColor: "#2a78d6",
  logoUrl: null,
  welcome: "Welcome! We're glad you're here.",
  givingUrl: null,
  allowMemberPosts: true,
  tabs: [{ kind: "home" }, { kind: "events" }, { kind: "sermons" }, { kind: "groups" }],
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const HTTP_URL = /^https?:\/\/[^\s"'<>]+$/i;

export type ManifestValidation = { ok: true; manifest: AppManifest } | { ok: false; error: string };

export function validateAppManifest(input: unknown): ManifestValidation {
  if (!input || typeof input !== "object") return { ok: false, error: "The app design could not be read." };
  const raw = input as Record<string, unknown>;

  const appName = typeof raw.appName === "string" ? raw.appName.trim() : "";
  if (!appName) return { ok: false, error: "Give the app a name." };
  if (appName.length > 30) return { ok: false, error: "App names are capped at 30 characters (App Store limit)." };

  const themeColor = typeof raw.themeColor === "string" ? raw.themeColor.trim() : "";
  if (!HEX_COLOR.test(themeColor)) return { ok: false, error: "Pick a theme color." };

  const logoUrl = typeof raw.logoUrl === "string" && raw.logoUrl.trim() ? raw.logoUrl.trim() : null;
  if (logoUrl && !HTTP_URL.test(logoUrl) && !logoUrl.startsWith("/")) {
    return { ok: false, error: "The logo needs an http(s) URL — upload one first." };
  }

  const welcome = typeof raw.welcome === "string" ? raw.welcome.trim().slice(0, 300) : "";

  const givingUrl = typeof raw.givingUrl === "string" && raw.givingUrl.trim() ? raw.givingUrl.trim() : null;
  if (givingUrl && !HTTP_URL.test(givingUrl)) {
    return { ok: false, error: "The giving link must be an http(s) URL." };
  }

  if (!Array.isArray(raw.tabs) || raw.tabs.length === 0) return { ok: false, error: "Choose at least one tab." };
  const tabs: AppTab[] = [];
  const seen = new Set<string>();
  for (const rawTab of raw.tabs) {
    // The bottom bar caps at 5: extra stored tabs are CLAMPED, never rejected —
    // a manifest saved before the cap keeps its app live with the first 5.
    if (tabs.length >= MAX_APP_TABS) break;
    const tab = rawTab as { kind?: unknown; label?: unknown; url?: unknown; pageId?: unknown };
    if (tab?.kind === "link") {
      const label = typeof tab.label === "string" ? tab.label.trim() : "";
      const url = typeof tab.url === "string" ? tab.url.trim() : "";
      if (!label || label.length > 20) return { ok: false, error: "Link tabs need a short label (max 20 characters)." };
      if (!HTTP_URL.test(url)) return { ok: false, error: "Link tabs need an http(s) URL." };
      tabs.push({ kind: "link", label, url });
      continue;
    }
    if (tab?.kind === "livestream") {
      const url = typeof tab.url === "string" ? tab.url.trim() : "";
      if (!HTTP_URL.test(url)) return { ok: false, error: "The livestream tab needs an http(s) URL." };
      if (seen.has("livestream")) return { ok: false, error: "Only one livestream tab." };
      seen.add("livestream");
      tabs.push({ kind: "livestream", url });
      continue;
    }
    if (tab?.kind === "page") {
      const pageId = typeof tab.pageId === "string" ? tab.pageId.trim() : "";
      const label = typeof tab.label === "string" ? tab.label.trim() : "";
      if (!pageId) return { ok: false, error: "Page tabs need a page — create one in Custom pages first." };
      if (!label || label.length > 20) return { ok: false, error: "Page tabs need a short label (max 20 characters)." };
      tabs.push({ kind: "page", pageId, label });
      continue;
    }
    const kind = tab?.kind as string;
    if (!(APP_TAB_KINDS as readonly string[]).includes(kind)) return { ok: false, error: "Unknown tab type." };
    if (seen.has(kind)) return { ok: false, error: "Each built-in tab can appear only once." };
    seen.add(kind);
    tabs.push({ kind: kind as AppTabKind });
  }
  if (!seen.has("home")) return { ok: false, error: "The app needs a Home tab." };

  // Backward compatible: manifests saved before the community feed default to true.
  const allowMemberPosts = raw.allowMemberPosts !== false;

  return {
    ok: true,
    manifest: { appName, themeColor: themeColor.toLowerCase(), logoUrl, welcome, givingUrl, allowMemberPosts, tabs },
  };
}

/** Display label for a tab (bottom bar + editor). */
export function appTabLabel(tab: AppTab): string {
  switch (tab.kind) {
    case "home":
      return "Home";
    case "events":
      return "Events";
    case "sermons":
      return "Media";
    case "groups":
      return "Groups";
    case "forms":
      return "Connect";
    case "giving":
      return "Give";
    case "livestream":
      return "Live";
    case "link":
    case "page":
      return tab.label;
  }
}
