import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { appService } from "@cms/database";
import { AppScreen } from "../../../components/church-app/AppScreen";
import { buildAppContent } from "../../../lib/church-app-content";

/**
 * The public church app (docs/domain/app.md): an installable, mobile-first web
 * app at /a/<publicAppId>, live only while the church has it published. Renders
 * the same AppScreen as App Studio's preview. Unauthenticated by design — it
 * shows only already-public content (events, sermons, published groups/forms).
 */

interface Props {
  params: Promise<{ publicAppId: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { publicAppId } = await params;
  const app = await appService.resolvePublicApp(publicAppId);
  if (!app) return {};
  return {
    title: app.manifest.appName,
    description: `${app.organizationName} — events, messages, groups, and more.`,
    manifest: `/a/${publicAppId}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: app.manifest.appName, statusBarStyle: "default" },
    ...(app.manifest.logoUrl ? { icons: { icon: app.manifest.logoUrl, apple: app.manifest.logoUrl } } : {}),
  };
}

export async function generateViewport({ params }: Props): Promise<Viewport> {
  const { publicAppId } = await params;
  const app = await appService.resolvePublicApp(publicAppId);
  return {
    width: "device-width",
    initialScale: 1,
    themeColor: app?.manifest.themeColor ?? "#2a78d6",
  };
}

export default async function PublicAppPage({ params, searchParams }: Props) {
  const [{ publicAppId }, { tab }] = await Promise.all([params, searchParams]);
  const app = await appService.resolvePublicApp(publicAppId);
  if (!app) notFound();

  const content = await buildAppContent(app.organizationId);
  const requested = Number.parseInt(tab ?? "0", 10);
  const activeIndex = Number.isFinite(requested) ? Math.min(Math.max(requested, 0), app.manifest.tabs.length - 1) : 0;

  return (
    <div className="mx-auto h-dvh max-w-md" style={{ backgroundColor: app.manifest.themeColor }}>
      <AppScreen
        manifest={app.manifest}
        organizationName={app.organizationName}
        content={content}
        activeIndex={activeIndex}
        tabHref={(i) => `/a/${publicAppId}?tab=${i}`}
      />
    </div>
  );
}
