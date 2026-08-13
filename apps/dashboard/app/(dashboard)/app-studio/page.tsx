import { headers } from "next/headers";
import { Lock, Smartphone } from "lucide-react";
import QRCode from "qrcode";
import { appFeedService, appPageService, appService, appTabLabel, validateAppManifest, DEFAULT_APP_MANIFEST, type AppManifest } from "@cms/database";
import { AppStudio } from "../../../components/AppStudio";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ShareCard } from "../../../components/ShareCard";
import { buildAppContent } from "../../../lib/church-app-content";
import { canApp } from "../../../lib/app-access";
import { getCurrentOrganization } from "../../../lib/session";

export default async function AppStudioPage() {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  if (!(await canApp(organization.id, "app.manage"))) {
    return (
      <Card padding="md" className="mt-6">
        <EmptyState icon={<Lock size={22} />} title="You don't have access to App Studio" description="" />
      </Card>
    );
  }

  const [app, content, feedPosts, pages] = await Promise.all([
    appService.getChurchApp(organization.id),
    buildAppContent(organization.id),
    // Signed-out feed view (church posts only) — what the preview's Home shows.
    appFeedService.listFeed(organization.id, null),
    appPageService.listActivePages(organization.id),
  ]);

  const stored = app ? validateAppManifest(app.config) : null;
  const manifest: AppManifest = stored?.ok
    ? stored.manifest
    : { ...DEFAULT_APP_MANIFEST, appName: organization.name.slice(0, 30) };

  let installUrl: string | null = null;
  let qrSvg: string | null = null;
  if (app) {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) {
      installUrl = `${h.get("x-forwarded-proto") ?? "http"}://${host}/a/${app.publicAppId}`;
      if (app.enabled) {
        qrSvg = await QRCode.toString(installUrl, { type: "svg", margin: 1, width: 240 });
      }
    }
  }

  // Share variants: the app itself plus a deep link to each tab (link tabs
  // open an external URL, so they aren't shareable destinations in the app).
  const shareVariants = installUrl
    ? [
        { label: "App home", url: installUrl },
        ...manifest.tabs
          .map((tab, i) => ({ tab, i }))
          .filter(({ tab }) => tab.kind !== "link")
          .map(({ tab, i }) => ({ label: `${appTabLabel(tab)} tab`, url: `${installUrl}?tab=${i}` })),
      ]
    : [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-1 flex items-center gap-2 text-display text-[28px] leading-tight text-ink">
          <Smartphone size={22} /> App Studio
        </h1>
        <p className="text-sm text-ink-secondary">
          Design your church&rsquo;s app and publish it as an installable web app today — the same design carries
          into App Store builds later. Content comes live from Events, Sermons, Groups, and Forms.
        </p>
      </div>
      <AppStudio
        initial={manifest}
        organizationName={organization.name}
        content={content}
        feedPosts={feedPosts}
        pages={pages.map((p) => ({ id: p.id, title: p.title }))}
        enabled={app?.enabled ?? false}
        listed={app?.listedInDirectory ?? true}
        installUrl={installUrl}
        qrSvg={qrSvg}
      />
      {app?.enabled && shareVariants.length > 0 && (
        <Card padding="md" className="mt-5 max-w-md">
          <ShareCard itemTitle={manifest.appName} variants={shareVariants} embed={false} canNotify />
        </Card>
      )}
    </div>
  );
}
