import type { AppTab, AppTabKind } from "@cms/database";

/**
 * Client-safe mirror of the tab constants/labels from
 * packages/database/src/app/manifest.ts. Client components must not import
 * @cms/database at runtime (it would drag Prisma into the browser bundle), and
 * these three are the only runtime values the app UI needs. Keep in sync with
 * the canonical module — validateAppManifest re-checks everything server-side,
 * so drift here can mislabel a button but never corrupt data.
 */

export const APP_TAB_KINDS_UI = ["home", "events", "sermons", "groups", "forms", "giving"] as const satisfies readonly AppTabKind[];

/** Client-safe mirror of REACTION_EMOJIS (canonical list lives in app-feed-service). */
export const REACTION_EMOJIS_UI = ["❤️", "🙏", "🙌", "🎉"] as const;

export const MAX_APP_TABS_UI = 5;

export function appTabLabelUi(tab: AppTab): string {
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
