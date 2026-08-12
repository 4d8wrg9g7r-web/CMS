import { headers } from "next/headers";
import { Globe, Lock } from "lucide-react";
import { siteService, parseSiteConfig } from "@cms/database";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
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

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-ink">
          <Globe size={22} /> Website
        </h1>
        <p className="text-sm text-ink-secondary">
          Your church&rsquo;s public website — pages built from sections, with events, sermons, and groups pulled
          live from the CMS. Edit, preview, then publish when it&rsquo;s ready.
        </p>
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
    </div>
  );
}
