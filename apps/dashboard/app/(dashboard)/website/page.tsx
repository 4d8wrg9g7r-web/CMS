import { headers } from "next/headers";
import { Globe, Lock, PenLine } from "lucide-react";
import { siteService, parseSiteConfig } from "@cms/database";
import { buttonClasses } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ShareCard } from "../../../components/ShareCard";
import { WebsiteStudio } from "../../../components/WebsiteStudio";
import { canApp } from "../../../lib/app-access";
import { getCurrentOrganization } from "../../../lib/session";

/**
 * Website studio (docs/domain/website.md): the church's public website, built
 * from section blocks. First open seeds the Victory template — a complete
 * seven-page church site — so the starting point is a finished site to edit,
 * not a blank canvas.
 */
export default async function WebsitePage() {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  if (!(await canApp(organization.id, "app.manage"))) {
    return (
      <Card padding="md" className="mt-6">
        <EmptyState icon={<Lock size={22} />} title="You don't have access to the Website studio" description="" />
      </Card>
    );
  }

  const site = await siteService.ensureSite(organization.id, organization.name);
  const config = parseSiteConfig(site.config, organization.name);

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const siteUrl = host ? `${h.get("x-forwarded-proto") ?? "http"}://${host}/w/${site.publicSiteKey}` : null;

  // Share variants: one per page — home lives at the site root, others at /<slug>.
  const shareVariants = siteUrl
    ? [...site.pages]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((page) => ({
          label: page.title,
          url: page.slug === "home" ? siteUrl : `${siteUrl}/${page.slug}`,
        }))
    : [];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 flex items-center gap-2 text-display text-[28px] leading-tight text-ink">
            <Globe size={22} /> Website
          </h1>
          <p className="text-sm text-ink-secondary">
            Your church&rsquo;s public website — pages built from sections, with events, sermons, and groups pulled
            live from the CMS. Edit, preview, then publish when it&rsquo;s ready.
          </p>
        </div>
        <a href="/studio/website" target="_blank" rel="noreferrer" className={buttonClasses("primary", "sm")} data-action="open-builder">
          <PenLine size={15} /> Open builder
        </a>
      </div>
      <WebsiteStudio
        published={site.published}
        siteUrl={siteUrl}
        config={config}
        pages={site.pages.map((page) => ({
          id: page.id,
          slug: page.slug,
          title: page.title,
          inNav: page.inNav,
          sortOrder: page.sortOrder,
          sectionCount: Array.isArray(page.sections) ? page.sections.length : 0,
        }))}
      />
      {site.published && shareVariants.length > 0 && (
        <Card padding="md" className="mt-5 max-w-md">
          <ShareCard itemTitle={config.siteName ?? organization.name} variants={shareVariants} canNotify />
        </Card>
      )}
    </div>
  );
}
