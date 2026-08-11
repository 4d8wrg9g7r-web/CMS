import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { appPageService, appService, validateAppManifest } from "@cms/database";
import { PagesStudio } from "../../../../components/PagesStudio";
import { Card } from "../../../../components/ui/Card";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { canApp } from "../../../../lib/app-access";
import { getCurrentOrganization } from "../../../../lib/session";

export default async function AppPagesPage() {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  if (!(await canApp(organization.id, "app.manage"))) {
    return (
      <Card padding="md" className="mt-6">
        <EmptyState icon={<Lock size={22} />} title="You don't have access to App Studio" description="" />
      </Card>
    );
  }

  const [pages, app] = await Promise.all([
    appPageService.listActivePages(organization.id),
    appService.getChurchApp(organization.id),
  ]);
  const stored = app ? validateAppManifest(app.config) : null;
  const themeColor = stored?.ok ? stored.manifest.themeColor : "#2a78d6";

  return (
    <div>
      <Link href="/app-studio" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
        <ArrowLeft size={14} /> Back to App Studio
      </Link>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight text-ink">Custom pages</h1>
      <p className="mb-6 max-w-2xl text-sm text-ink-secondary">
        Design your own app screens — upload graphics, make them tappable, and point every link at an app tab, an
        in-app page, or the browser. Add a page to your bottom bar from App Studio&rsquo;s tab picker.
      </p>
      <PagesStudio initialPages={pages} themeColor={themeColor} />
    </div>
  );
}
