import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { siteService } from "@cms/database";
import { SiteRenderer } from "../../../components/site/SiteRenderer";
import { buildSiteLiveContent } from "../../../lib/site-content";
import { resolveSiteForRequest } from "../../../lib/site-request";

/**
 * The public church website (docs/domain/website.md): /w/<publicSiteKey> is
 * the home page, built from section blocks in the Website studio. Live only
 * once the church publishes; drafts 404 here (the studio previews them).
 */

interface Props {
  params: Promise<{ publicSiteKey: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { publicSiteKey } = await params;
  const site = await siteService.resolvePublicSite(publicSiteKey);
  if (!site) return {};
  return {
    title: site.config.siteName,
    description: site.config.tagline || `${site.config.siteName} — join us this week.`,
  };
}

export default async function PublicSiteHomePage({ params }: Props) {
  const { publicSiteKey } = await params;
  const site = await resolveSiteForRequest(publicSiteKey);
  if (!site) notFound();
  const page = await siteService.resolvePublicPage(publicSiteKey, "home", { preview: !site.published });
  if (!page) notFound();
  const live = await buildSiteLiveContent(site.organizationId, page.sections);
  return <SiteRenderer site={site} page={page} live={live} basePath={`/w/${publicSiteKey}`} />;
}
