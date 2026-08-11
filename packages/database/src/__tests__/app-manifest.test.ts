import { describe, expect, it } from "vitest";
import { appTabLabel, validateAppManifest, DEFAULT_APP_MANIFEST, MAX_APP_TABS } from "../app/manifest";

const VALID = {
  appName: "Victory Church",
  themeColor: "#2A78D6",
  logoUrl: "https://cdn.example.org/logo.png",
  welcome: "Welcome home!",
  givingUrl: "https://give.example.org",
  tabs: [{ kind: "home" }, { kind: "sermons" }, { kind: "link", label: "Watch Live", url: "https://youtube.com/@x" }],
};

describe("validateAppManifest", () => {
  it("accepts a full manifest and normalizes the color", () => {
    const result = validateAppManifest(VALID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.themeColor).toBe("#2a78d6");
      expect(result.manifest.tabs).toHaveLength(3);
    }
  });

  it("the default manifest passes once named", () => {
    expect(validateAppManifest({ ...DEFAULT_APP_MANIFEST, appName: "Grace Chapel" }).ok).toBe(true);
  });

  it("requires a name (App Store length cap), color, and a home tab", () => {
    expect(validateAppManifest({ ...VALID, appName: " " }).ok).toBe(false);
    expect(validateAppManifest({ ...VALID, appName: "x".repeat(31) }).ok).toBe(false);
    expect(validateAppManifest({ ...VALID, themeColor: "blue" }).ok).toBe(false);
    expect(validateAppManifest({ ...VALID, tabs: [{ kind: "events" }] }).ok).toBe(false);
  });

  it("rejects bad tabs: unknown kinds, duplicates, bad links; clamps oversized lists", () => {
    expect(validateAppManifest({ ...VALID, tabs: [{ kind: "home" }, { kind: "podcast" }] }).ok).toBe(false);
    expect(validateAppManifest({ ...VALID, tabs: [{ kind: "home" }, { kind: "home" }] }).ok).toBe(false);
    const clamped = validateAppManifest({
      ...VALID,
      tabs: [{ kind: "home" }, ...Array.from({ length: MAX_APP_TABS }, (_, i) => ({ kind: "link", label: `L${i}`, url: "https://x.org" }))],
    });
    expect(clamped.ok).toBe(true);
    if (clamped.ok) expect(clamped.manifest.tabs).toHaveLength(MAX_APP_TABS);
    expect(validateAppManifest({ ...VALID, tabs: [{ kind: "home" }, { kind: "link", label: "Bad", url: "javascript:x" }] }).ok).toBe(false);
  });

  it("restricts giving and logo URLs", () => {
    expect(validateAppManifest({ ...VALID, givingUrl: "ftp://x" }).ok).toBe(false);
    const localLogo = validateAppManifest({ ...VALID, logoUrl: "/uploads/org/logo.png" });
    expect(localLogo.ok).toBe(true);
  });

  it("defaults allowMemberPosts to true for pre-feed manifests, honors explicit false", () => {
    const legacy = validateAppManifest(VALID);
    expect(legacy.ok && legacy.manifest.allowMemberPosts).toBe(true);
    const off = validateAppManifest({ ...VALID, allowMemberPosts: false });
    expect(off.ok && off.manifest.allowMemberPosts).toBe(false);
  });

  it("labels tabs", () => {
    expect(appTabLabel({ kind: "forms" })).toBe("Connect");
    expect(appTabLabel({ kind: "link", label: "Watch", url: "https://x.org" })).toBe("Watch");
  });
});
