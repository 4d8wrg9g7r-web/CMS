import type { SiteSection, SiteSectionKind } from "@cms/database";

/**
 * Client-safe mirror of the section-kind constants from
 * packages/database/src/site/site-sections.ts. Client components must not
 * import @cms/database at runtime (it would drag Prisma/node:crypto into the
 * browser bundle). parseSections re-validates everything server-side on save,
 * so drift here can mislabel a block but never corrupt data.
 */

export const SECTION_KINDS_UI: SiteSectionKind[] = [
  "hero",
  "serviceTimes",
  "textImage",
  "cardGrid",
  "events",
  "sermons",
  "groups",
  "give",
  "cta",
  "team",
  "visit",
  "markdown",
];

export const SECTION_KIND_LABELS_UI: Record<SiteSectionKind, string> = {
  hero: "Hero banner",
  serviceTimes: "Service times",
  textImage: "Text + image",
  cardGrid: "Card grid",
  events: "Upcoming events (live)",
  sermons: "Latest sermons (live)",
  groups: "Groups directory (live)",
  give: "Giving",
  cta: "Call to action",
  team: "Team",
  visit: "Visit us",
  markdown: "Text",
};

/** Fresh editable block per kind — same defaults blankSection() produces server-side. */
export function blankSectionUi(kind: SiteSectionKind): SiteSection {
  switch (kind) {
    case "hero":
      return { kind, headline: "", subheadline: "", imageUrl: "", ctas: [] };
    case "serviceTimes":
      return { kind, title: "" };
    case "textImage":
      return { kind, title: "", body: "", imageUrl: "", imageSide: "right" };
    case "cardGrid":
      return { kind, title: "", cards: [] };
    case "events":
      return { kind, title: "Upcoming events", limit: 6 };
    case "sermons":
      return { kind, title: "Latest messages", limit: 3 };
    case "groups":
      return { kind, title: "Find a group", limit: 6 };
    case "give":
      return { kind, title: "Give", body: "" };
    case "cta":
      return { kind, title: "", body: "", ctas: [] };
    case "team":
      return { kind, title: "Our team", people: [] };
    case "visit":
      return { kind, title: "Visit us", body: "" };
    case "markdown":
      return { kind, body: "" };
  }
}
