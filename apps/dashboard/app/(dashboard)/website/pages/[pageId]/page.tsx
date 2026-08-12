import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { parseSections, siteService } from "@cms/database";
import { Card } from "../../../../../components/ui/Card";
import { EmptyState } from "../../../../../components/ui/EmptyState";
import { WebsiteSectionEditor } from "../../../../../components/WebsiteSectionEditor";
import { canApp } from "../../../../../lib/app-access";
import { getCurrentOrganization } from "../../../../../lib/session";

/** Section editor for one website page (docs/domain/website.md). */
export default async function WebsitePageEditor({ params }: { params: Promise<{ pageId: string }> }) {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  if (!(await canApp(organization.id, "app.manage"))) {
    return (
      <Card padding="md" className="mt-6">
        <EmptyState icon={<Lock size={22} />} title="You don't have access to the Website studio" description="" />
      </Card>
    );
  }

  const { pageId } = await params;
  const [page, site] = await Promise.all([
    siteService.getPage(organization.id, pageId),
    siteService.getSite(organization.id),
  ]);
  if (!page || !site) notFound();

  const previewUrl = page.slug === "home" ? `/w/${site.publicSiteKey}` : `/w/${site.publicSiteKey}/${page.slug}`;

  return (
    <div>
      <div className="mb-6">
        <Link href="/website" className="mb-2 inline-flex items-center gap-1 text-sm text-ink-secondary hover:text-ink">
          <ArrowLeft size={15} /> Website
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{page.title}</h1>
        <p className="text-sm text-ink-secondary">{page.slug === "home" ? "Home page" : `/${page.slug}`}</p>
      </div>
      <WebsiteSectionEditor
        pageId={page.id}
        pageTitle={page.title}
        previewUrl={previewUrl}
        initialSections={parseSections(page.sections)}
      />
    </div>
  );
}
