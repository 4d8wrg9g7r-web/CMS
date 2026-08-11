import type { ExpoConfig } from "expo/config";

/**
 * One codebase, two products (docs/domain/app.md):
 *
 *   Container (default): the store app that previews every church —
 *     APP_VARIANT unset or "container".
 *
 *   White-label: one church's own store listing, built from the same code —
 *     APP_VARIANT=whitelabel CHURCH_APP_ID=<publicAppId>
 *     CHURCH_APP_NAME="First Baptist" CHURCH_APP_SLUG=first-baptist
 *     (submitted under the church's own developer account per App Store
 *     guideline 4.2.6; the nonprofit fee waiver applies).
 *
 * EXPO_PUBLIC_API_BASE points builds at a different CMS deployment (e.g. local
 * dev via `EXPO_PUBLIC_API_BASE=http://localhost:3000 npx expo start`).
 */

const variant = process.env.APP_VARIANT === "whitelabel" ? "whitelabel" : "container";
const churchAppId = process.env.CHURCH_APP_ID?.trim() || null;
const churchName = process.env.CHURCH_APP_NAME?.trim() || null;
const churchSlug = process.env.CHURCH_APP_SLUG?.trim() || null;

if (variant === "whitelabel" && !churchAppId) {
  throw new Error("APP_VARIANT=whitelabel requires CHURCH_APP_ID=<publicAppId>");
}

const name = variant === "whitelabel" ? (churchName ?? "Church App") : "Church Connect";
const slug = variant === "whitelabel" ? (churchSlug ?? "church-app") : "church-connect";

const config: ExpoConfig = {
  name,
  slug,
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  ios: {
    supportsTablet: false,
    bundleIdentifier: `nu.victorychurch.cms.${slug.replace(/-/g, "")}`,
  },
  android: {
    package: `nu.victorychurch.cms.${slug.replace(/-/g, "")}`,
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
  },
  web: { favicon: "./assets/favicon.png" },
  // NOTE: expo config serializes null extra values as {} — omit keys instead,
  // and read them with a typeof === "string" guard (see App.tsx / api.ts).
  extra: {
    variant,
    // White-label builds pin the app to one church; container omits the key.
    ...(variant === "whitelabel" && churchAppId ? { pinnedAppId: churchAppId } : {}),
    ...(process.env.EXPO_PUBLIC_API_BASE ? { apiBase: process.env.EXPO_PUBLIC_API_BASE } : {}),
  },
};

export default config;
