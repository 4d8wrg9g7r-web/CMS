import Link from "next/link";
import { parseSections, siteService } from "@cms/database";
import { StudioTopBar } from "../../../components/StudioTopBar";
import { ToastProvider } from "../../../components/ui/Toast";
import { WebsiteSectionEditor } from "../../../components/WebsiteSectionEditor";
import { canApp } from "../../../lib/app-access";
import { getCurrentOrganization } from "../../../lib/session";

export const metadata = { title: "Website builder" };

/**
 * The full-page website builder (docs/domain/website.md "Studio"): opened in
 * its own tab from the dashboard, it fills the viewport — top bar (exit, page
 * switcher, publish, view live), live canvas, and inspector. Same editor,
 * same permission (app.manage), same audited actions as the embedded studio;
 * only the chrome differs. Site settings stay on /website.
 */
export default async function WebsiteBuilderPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const organization = await getCurrentOrganization();
  if (!organization) {
    return (
      <p className="p-10 text-center text-sm text-ink-secondary">
        Sign in to use the website builder. <Link href="/login" className="text-accent hover:underline">Go to sign in</Link>
      </p>
    );
  }
  if (!(await canApp(organization.id, "app.manage"))) {
    return <p className="p-10 text-center text-sm text-ink-secondary">You don&rsquo;t have access to the website builder.</p>;
  }

  const site = await siteService.ensureSite(organization.id, organization.name);
  const { page: requestedPageId } = await searchParams;
  const page = site.pages.find((p) => p.id === requestedPageId) ?? site.pages.find((p) => p.slug === "home") ?? site.pages[0];
  if (!page) return <p className="p-10 text-center text-sm text-ink-secondary">This site has no pages yet — create one from the dashboard.</p>;

  const liveUrl = `/w/${site.publicSiteKey}`;
  const previewUrl = page.slug === "home" ? liveUrl : `${liveUrl}/${page.slug}`;

  return (
    <ToastProvider>
      <div className="flex h-screen flex-col bg-background" data-section="studio-fullpage">
        <StudioTopBar
          siteName={organization.name}
          pages={site.pages.map((p) => ({ id: p.id, title: p.title, slug: p.slug }))}
          currentPageId={page.id}
          published={site.published}
          liveUrl={liveUrl}
        />
        <div className="min-h-0 flex-1 px-4 py-4">
          <WebsiteSectionEditor
            key={page.id}
            fullScreen
            pageId={page.id}
            pageTitle={page.title}
            previewUrl={previewUrl}
            initialSections={parseSections(page.sections)}
          />
        </div>
      </div>
    </ToastProvider>
  );
}
