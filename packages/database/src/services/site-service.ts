import { Prisma } from "@prisma/client";
import { rawDb, tenantDb } from "../client";
import { defaultSiteConfig, parseSiteConfig, type SiteConfig } from "../site/site-config";
import {
  pageSlugError,
  parseSections,
  victoryTemplate,
  type SiteSection,
} from "../site/site-sections";

/**
 * Website builder (docs/domain/website.md). One Site per organization, seeded
 * from the Victory template on first open. The public surface is
 * /w/<publicSiteKey> — resolution by unguessable key is the documented rawDb
 * bootstrapping exception, same as churchApp/forms; everything else is
 * tenant-scoped.
 */

export interface SitePageSummary {
  id: string;
  slug: string;
  title: string;
  inNav: boolean;
  sortOrder: number;
}

function pageOrder() {
  return [{ sortOrder: "asc" }, { createdAt: "asc" }] satisfies Prisma.SitePageOrderByWithRelationInput[];
}

/** The org's site with ordered pages, seeding the Victory template on first use. */
export async function ensureSite(organizationId: string, organizationName: string) {
  const existing = await tenantDb.site.findFirst({
    where: { organizationId },
    include: { pages: { orderBy: pageOrder() } },
  });
  if (existing) return existing;

  const config = defaultSiteConfig(organizationName);
  config.tagline = "Helping People Become Who God Created Them to Be";
  const site = await tenantDb.site.create({
    data: { organizationId, config: config as unknown as Prisma.InputJsonValue },
  });
  await tenantDb.sitePage.createMany({
    data: victoryTemplate(organizationName).map((page) => ({
      organizationId,
      siteId: site.id,
      slug: page.slug,
      title: page.title,
      inNav: page.inNav,
      sortOrder: page.sortOrder,
      sections: page.sections as unknown as Prisma.InputJsonValue,
    })),
  });
  const seeded = await tenantDb.site.findFirst({
    where: { organizationId },
    include: { pages: { orderBy: pageOrder() } },
  });
  if (!seeded) throw new Error("Site seeding failed");
  return seeded;
}

export async function getSite(organizationId: string) {
  return tenantDb.site.findFirst({
    where: { organizationId },
    include: { pages: { orderBy: pageOrder() } },
  });
}

export async function updateSiteConfig(organizationId: string, raw: unknown, fallbackName: string) {
  const config = parseSiteConfig(raw, fallbackName);
  await tenantDb.site.updateMany({
    where: { organizationId },
    data: { config: config as unknown as Prisma.InputJsonValue },
  });
  return config;
}

export async function setSitePublished(organizationId: string, published: boolean) {
  await tenantDb.site.updateMany({ where: { organizationId }, data: { published } });
}

export async function getPage(organizationId: string, pageId: string) {
  return tenantDb.sitePage.findFirst({ where: { organizationId, id: pageId } });
}

export async function createPage(
  organizationId: string,
  input: { slug: string; title: string },
): Promise<{ ok: true; pageId: string } | { ok: false; error: string }> {
  const slug = input.slug.trim().toLowerCase();
  const title = input.title.trim();
  const slugProblem = pageSlugError(slug);
  if (slugProblem) return { ok: false, error: slugProblem };
  if (!title) return { ok: false, error: "Give the page a title." };

  const site = await tenantDb.site.findFirst({ where: { organizationId }, include: { pages: true } });
  if (!site) return { ok: false, error: "Set up the website first." };
  if (site.pages.some((p) => p.slug === slug)) return { ok: false, error: "A page with that slug already exists." };

  const page = await tenantDb.sitePage.create({
    data: {
      organizationId,
      siteId: site.id,
      slug,
      title,
      sections: [
        { kind: "hero", headline: title, subheadline: "", imageUrl: "", ctas: [] },
      ] as unknown as Prisma.InputJsonValue,
      sortOrder: Math.max(0, ...site.pages.map((p) => p.sortOrder)) + 1,
    },
  });
  return { ok: true, pageId: page.id };
}

export async function updatePage(
  organizationId: string,
  pageId: string,
  input: { title?: string; inNav?: boolean; sortOrder?: number; sections?: unknown },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const page = await tenantDb.sitePage.findFirst({ where: { organizationId, id: pageId } });
  if (!page) return { ok: false, error: "Page not found." };

  const data: Prisma.SitePageUpdateManyMutationInput = {};
  if (typeof input.title === "string" && input.title.trim()) data.title = input.title.trim();
  if (typeof input.inNav === "boolean") data.inNav = page.slug === "home" ? false : input.inNav;
  if (typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)) {
    data.sortOrder = Math.round(input.sortOrder);
  }
  if (typeof input.sections !== "undefined") {
    data.sections = parseSections(input.sections) as unknown as Prisma.InputJsonValue;
  }
  await tenantDb.sitePage.updateMany({ where: { organizationId, id: pageId }, data });
  return { ok: true };
}

export async function deletePage(
  organizationId: string,
  pageId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const page = await tenantDb.sitePage.findFirst({ where: { organizationId, id: pageId } });
  if (!page) return { ok: false, error: "Page not found." };
  if (page.slug === "home") return { ok: false, error: "The home page can't be deleted." };
  await tenantDb.sitePage.deleteMany({ where: { organizationId, id: pageId } });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Public resolution — the /w/<publicSiteKey> boundary.
// ---------------------------------------------------------------------------

export interface PublicSite {
  organizationId: string;
  organizationName: string;
  publicSiteKey: string;
  published: boolean;
  config: SiteConfig;
  /** Nav pages (inNav, ordered). Home is the logo link, not listed here. */
  nav: { slug: string; title: string }[];
  /** Church app deep link for give/groups sections, when the app is enabled. */
  publicAppId: string | null;
  /** Org public key for the existing /g/<id> group finder and /c/<id> calendar. */
  publicSiteId: string;
}

/**
 * Resolve a published site by its unguessable key. Unpublished sites 404 for
 * the public, but `preview: true` (studio-only callers, staff-authenticated)
 * resolves drafts so the builder can preview before publishing.
 */
export async function resolvePublicSite(
  publicSiteKey: string,
  opts: { preview?: boolean } = {},
): Promise<PublicSite | null> {
  const site = await rawDb.site.findUnique({
    where: { publicSiteKey },
    include: {
      organization: {
        select: { id: true, name: true, publicSiteId: true, churchApp: { select: { publicAppId: true, enabled: true } } },
      },
      pages: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!site) return null;
  if (!site.published && !opts.preview) return null;
  return {
    organizationId: site.organization.id,
    organizationName: site.organization.name,
    publicSiteKey: site.publicSiteKey,
    published: site.published,
    config: parseSiteConfig(site.config, site.organization.name),
    nav: site.pages.filter((p) => p.inNav && p.slug !== "home").map((p) => ({ slug: p.slug, title: p.title })),
    publicAppId: site.organization.churchApp?.enabled ? site.organization.churchApp.publicAppId : null,
    publicSiteId: site.organization.publicSiteId,
  };
}

export interface PublicSitePage {
  slug: string;
  title: string;
  sections: SiteSection[];
}

/** A single page of a resolved site, sections re-validated on the way out. */
export async function resolvePublicPage(
  publicSiteKey: string,
  slug: string,
  opts: { preview?: boolean } = {},
): Promise<PublicSitePage | null> {
  const site = await rawDb.site.findUnique({
    where: { publicSiteKey },
    select: { published: true, pages: { where: { slug }, take: 1 } },
  });
  if (!site) return null;
  if (!site.published && !opts.preview) return null;
  const page = site.pages[0];
  if (!page) return null;
  return { slug: page.slug, title: page.title, sections: parseSections(page.sections) };
}
