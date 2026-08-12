import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { siteService } from "@cms/database";
import { SiteRenderer } from "../../../../components/site/SiteRenderer";
import { buildSiteLiveContent } from "../../../../lib/site-content";
import { resolveSiteForRequest } from "../../../../lib/site-request";

/** Inner pages of the public church website — /w/<publicSiteKey>/<slug>. */

interface Props {
  params: Promise<{ publicSiteKey: string; slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { publicSiteKey, slug } = await params;
  const [site, page] = await Promise.all([
    siteService.resolvePublicSite(publicSiteKey),
    siteService.resolvePublicPage(publicSiteKey, slug),
  ]);
  if (!site || !page) return {};
  return { title: `${page.title} · ${site.config.siteName}` };
}

export default async function PublicSitePage({ params }: Props) {
  const { publicSiteKey, slug } = await params;
  const site = await resolveSiteForRequest(publicSiteKey);
  if (!site) notFound();
  const page = await siteService.resolvePublicPage(publicSiteKey, slug, { preview: !site.published });
  if (!page || page.slug === "home") notFound();
  const live = await buildSiteLiveContent(site.organizationId, page.sections);
  return <SiteRenderer site={site} page={page} live={live} basePath={`/w/${publicSiteKey}`} />;
}
