/**
 * Website builder section blocks (docs/domain/website.md). A page is an
 * ordered array of these; SitePage.sections stores them as JSON. Live kinds
 * (events/sermons/groups/give) carry no content of their own — the renderer
 * pulls current CMS data at request time, which is the builder's whole pitch.
 *
 * Pure: parsing/validation + the Victory template seed. Unit-tested.
 */

export interface SectionCta {
  label: string;
  /** Internal ("/plan-a-visit") or external ("https://…") link. */
  href: string;
}

export interface HeroSection {
  kind: "hero";
  headline: string;
  subheadline: string;
  imageUrl: string;
  ctas: SectionCta[];
}

/** Renders the site-config serviceTimes list — no content of its own beyond a title. */
export interface ServiceTimesSection {
  kind: "serviceTimes";
  title: string;
}

export interface TextImageSection {
  kind: "textImage";
  title: string;
  /** Markdown body (the renderer supports paragraphs, bold, lists, links). */
  body: string;
  imageUrl: string;
  imageSide: "left" | "right";
}

export interface Card {
  title: string;
  body: string;
  href: string;
}

export interface CardGridSection {
  kind: "cardGrid";
  title: string;
  cards: Card[];
}

/** Live: upcoming public events from the CMS events module. */
export interface EventsSection {
  kind: "events";
  title: string;
  limit: number;
}

/** Live: latest sermons from the CMS media library. */
export interface SermonsSection {
  kind: "sermons";
  title: string;
  limit: number;
}

/** Live: open groups directory with a link into the church app group finder. */
export interface GroupsSection {
  kind: "groups";
  title: string;
  limit: number;
}

/** Give call-to-action linking to the church app's giving tab. */
export interface GiveSection {
  kind: "give";
  title: string;
  body: string;
}

export interface CtaSection {
  kind: "cta";
  title: string;
  body: string;
  ctas: SectionCta[];
}

export interface TeamMember {
  name: string;
  role: string;
  imageUrl: string;
}

export interface TeamSection {
  kind: "team";
  title: string;
  people: TeamMember[];
}

/** Contact/visit block — address, phone, email, service times from site config. */
export interface VisitSection {
  kind: "visit";
  title: string;
  body: string;
}

export interface MarkdownSection {
  kind: "markdown";
  body: string;
}

export type SiteSection =
  | HeroSection
  | ServiceTimesSection
  | TextImageSection
  | CardGridSection
  | EventsSection
  | SermonsSection
  | GroupsSection
  | GiveSection
  | CtaSection
  | TeamSection
  | VisitSection
  | MarkdownSection;

export type SiteSectionKind = SiteSection["kind"];

export const SECTION_KINDS: SiteSectionKind[] = [
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

export const SECTION_KIND_LABELS: Record<SiteSectionKind, string> = {
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

const MAX_SECTIONS_PER_PAGE = 30;
const MAX_CARDS = 12;
const MAX_CTAS = 3;
const MAX_PEOPLE = 24;

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max).trim() : "";
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function parseCtas(raw: unknown): SectionCta[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c) => ({ label: str(c.label, 60), href: str(c.href, 500) }))
    .filter((c) => c.label.length > 0)
    .slice(0, MAX_CTAS);
}

/**
 * Coerce one untrusted block into a valid section, or null if the kind is
 * unknown. Field-level junk becomes empty strings/defaults — a malformed save
 * degrades a block, never crashes the public site.
 */
export function parseSection(raw: unknown): SiteSection | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  switch (r.kind) {
    case "hero":
      return {
        kind: "hero",
        headline: str(r.headline, 200),
        subheadline: str(r.subheadline, 300),
        imageUrl: str(r.imageUrl, 1000),
        ctas: parseCtas(r.ctas),
      };
    case "serviceTimes":
      return { kind: "serviceTimes", title: str(r.title, 120) };
    case "textImage":
      return {
        kind: "textImage",
        title: str(r.title, 200),
        body: str(r.body, 10_000),
        imageUrl: str(r.imageUrl, 1000),
        imageSide: r.imageSide === "left" ? "left" : "right",
      };
    case "cardGrid":
      return {
        kind: "cardGrid",
        title: str(r.title, 200),
        cards: Array.isArray(r.cards)
          ? r.cards
              .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
              .map((c) => ({ title: str(c.title, 120), body: str(c.body, 1000), href: str(c.href, 500) }))
              .filter((c) => c.title.length > 0)
              .slice(0, MAX_CARDS)
          : [],
      };
    case "events":
      return { kind: "events", title: str(r.title, 120) || "Upcoming events", limit: num(r.limit, 6, 1, 12) };
    case "sermons":
      return { kind: "sermons", title: str(r.title, 120) || "Latest messages", limit: num(r.limit, 3, 1, 12) };
    case "groups":
      return { kind: "groups", title: str(r.title, 120) || "Find a group", limit: num(r.limit, 6, 1, 12) };
    case "give":
      return { kind: "give", title: str(r.title, 120) || "Give", body: str(r.body, 2000) };
    case "cta":
      return { kind: "cta", title: str(r.title, 200), body: str(r.body, 2000), ctas: parseCtas(r.ctas) };
    case "team":
      return {
        kind: "team",
        title: str(r.title, 120) || "Our team",
        people: Array.isArray(r.people)
          ? r.people
              .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
              .map((p) => ({ name: str(p.name, 120), role: str(p.role, 120), imageUrl: str(p.imageUrl, 1000) }))
              .filter((p) => p.name.length > 0)
              .slice(0, MAX_PEOPLE)
          : [],
      };
    case "visit":
      return { kind: "visit", title: str(r.title, 120) || "Visit us", body: str(r.body, 2000) };
    case "markdown":
      return { kind: "markdown", body: str(r.body, 20_000) };
    default:
      return null;
  }
}

/** Coerce an untrusted sections array — unknown kinds dropped, capped per page. */
export function parseSections(raw: unknown): SiteSection[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(parseSection)
    .filter((s): s is SiteSection => s !== null)
    .slice(0, MAX_SECTIONS_PER_PAGE);
}

/** A fresh block of the given kind with sensible editable defaults, for the studio's "Add section". */
export function blankSection(kind: SiteSectionKind): SiteSection {
  const parsed = parseSection({ kind });
  if (!parsed) throw new Error(`Unknown section kind: ${kind}`);
  return parsed;
}

export function pageSlugError(slug: string): string | null {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    return "Slugs are lowercase letters, numbers, and hyphens (e.g. plan-a-visit).";
  }
  if (slug.length > 60) return "That slug is too long.";
  return null;
}

// ---------------------------------------------------------------------------
// The Victory template — the builder's flagship starting point, modeled on
// victorychurch.nu's structure (hero → service times → what to expect →
// ministries → live content → visit). Parameterized by church name; every
// word is an editable default, not fixed chrome.
// ---------------------------------------------------------------------------

export interface TemplatePage {
  slug: string;
  title: string;
  inNav: boolean;
  sortOrder: number;
  sections: SiteSection[];
}

export function victoryTemplate(churchName: string): TemplatePage[] {
  const name = churchName.trim() || "Our Church";
  return [
    {
      slug: "home",
      title: "Home",
      inNav: false,
      sortOrder: 0,
      sections: [
        {
          kind: "hero",
          headline: "Helping People Become Who God Created Them to Be",
          subheadline: `Join us this week at ${name} — everyone is welcome.`,
          imageUrl: "",
          ctas: [
            { label: "Plan a Visit", href: "/plan-a-visit" },
            { label: "Watch Online", href: "/watch" },
          ],
        },
        { kind: "serviceTimes", title: "Join us this week" },
        {
          kind: "textImage",
          title: "What to expect",
          body:
            "Expect a warm welcome, contemporary worship, and practical biblical teaching. " +
            "Services last about 90 minutes, and there's no dress code — come as you are.",
          imageUrl: "",
          imageSide: "right",
        },
        { kind: "events", title: "Upcoming events", limit: 6 },
        { kind: "sermons", title: "Latest messages", limit: 3 },
        {
          kind: "give",
          title: "Give",
          body: `Your generosity fuels everything ${name} does — thank you for partnering with us.`,
        },
        { kind: "visit", title: "Visit us", body: "We'd love to meet you this week." },
      ],
    },
    {
      slug: "plan-a-visit",
      title: "Plan a Visit",
      inNav: true,
      sortOrder: 1,
      sections: [
        {
          kind: "hero",
          headline: "New here? Welcome.",
          subheadline: `Here's everything you need to know before your first visit to ${name}.`,
          imageUrl: "",
          ctas: [],
        },
        { kind: "serviceTimes", title: "Service times" },
        {
          kind: "textImage",
          title: "What to expect",
          body:
            "A friendly welcome at the door, contemporary worship, and a practical message from the Bible. " +
            "Services run about 90 minutes. Dress is casual — come as you are.",
          imageUrl: "",
          imageSide: "right",
        },
        {
          kind: "textImage",
          title: "Kids are loved here",
          body:
            "Our kids ministry serves infants through 5th grade with safe, secure check-in. " +
            "Plan to arrive about 10 minutes early on your first visit so we can get your family checked in.",
          imageUrl: "",
          imageSide: "left",
        },
        { kind: "visit", title: "Directions & contact", body: "Questions before you come? We'd love to help." },
      ],
    },
    {
      slug: "about",
      title: "About",
      inNav: true,
      sortOrder: 2,
      sections: [
        {
          kind: "hero",
          headline: `About ${name}`,
          subheadline: "Who we are, what we believe, and where we're headed.",
          imageUrl: "",
          ctas: [],
        },
        {
          kind: "markdown",
          body:
            `${name} exists to help people become who God created them to be. ` +
            "We're a non-denominational church that believes the Bible is God's Word, " +
            "that everyone matters to God, and that church should be a place where anyone can belong.",
        },
        { kind: "team", title: "Our team", people: [] },
        {
          kind: "cta",
          title: "Come see for yourself",
          body: "The best way to get to know us is to join us on a Sunday.",
          ctas: [{ label: "Plan a Visit", href: "/plan-a-visit" }],
        },
      ],
    },
    {
      slug: "ministries",
      title: "Ministries",
      inNav: true,
      sortOrder: 3,
      sections: [
        {
          kind: "hero",
          headline: "Ministries",
          subheadline: "There's a place for every age and season of life.",
          imageUrl: "",
          ctas: [],
        },
        {
          kind: "cardGrid",
          title: "Find your place",
          cards: [
            {
              title: "Kids",
              body: "Safe, fun, Bible-based environments for infants through 5th grade, with secure check-in.",
              href: "/plan-a-visit",
            },
            { title: "Youth", body: "A place for middle and high schoolers to grow in faith and friendship.", href: "" },
            { title: "Adults", body: "Classes, gatherings, and serving opportunities throughout the week.", href: "" },
            { title: "Prayer", body: "Join us as we pray together for our church, our city, and each other.", href: "" },
          ],
        },
        { kind: "groups", title: "Small groups", limit: 6 },
      ],
    },
    {
      slug: "events",
      title: "Events",
      inNav: true,
      sortOrder: 4,
      sections: [
        { kind: "hero", headline: "Events", subheadline: `What's happening at ${name}.`, imageUrl: "", ctas: [] },
        { kind: "events", title: "Upcoming events", limit: 12 },
      ],
    },
    {
      slug: "watch",
      title: "Watch",
      inNav: true,
      sortOrder: 5,
      sections: [
        { kind: "hero", headline: "Watch", subheadline: "Catch up on recent messages.", imageUrl: "", ctas: [] },
        { kind: "sermons", title: "Latest messages", limit: 12 },
      ],
    },
    {
      slug: "giving",
      title: "Give",
      inNav: true,
      sortOrder: 6,
      sections: [
        {
          kind: "hero",
          headline: "Generosity changes lives",
          subheadline: "Thank you for partnering with what God is doing here.",
          imageUrl: "",
          ctas: [],
        },
        {
          kind: "give",
          title: "Give online",
          body: "Give securely online — one time or recurring, by card or bank account.",
        },
      ],
    },
  ];
}
