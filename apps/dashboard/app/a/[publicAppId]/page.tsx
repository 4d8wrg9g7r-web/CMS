import type { Metadata, Viewport } from "next";
import { ChevronRight, Users2 } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { appFeedService, appMemberService, appService, groupService } from "@cms/database";
import { AppFeed } from "../../../components/church-app/AppFeed";
import { AppScreen } from "../../../components/church-app/AppScreen";
import { buildAppContent } from "../../../lib/church-app-content";
import { webPushPublicKey } from "../../../lib/app-push";

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

  // Member session (optional): drives the community feed's visibility and composer.
  const token = (await cookies()).get(`app_session_${publicAppId}`)?.value ?? "";
  const member = token ? await appMemberService.getSessionMember(app.organizationId, token) : null;

  const [content, posts, myGroups] = await Promise.all([
    buildAppContent(app.organizationId),
    appFeedService.listFeed(app.organizationId, member?.personId ?? null),
    member ? groupService.listGroupsForPerson(app.organizationId, member.personId) : Promise.resolve([]),
  ]);

  const requested = Number.parseInt(tab ?? "0", 10);
  const activeIndex = Number.isFinite(requested) ? Math.min(Math.max(requested, 0), app.manifest.tabs.length - 1) : 0;

  // Signed-in members get direct entry into their group spaces from the Groups tab.
  const myGroupsNav =
    myGroups.length > 0 ? (
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">My groups</p>
        <div className="flex flex-col gap-2">
          {myGroups.map((membership) => (
            <Link
              key={membership.group.id}
              href={`/a/${publicAppId}/group/${membership.group.id}`}
              className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4"
            >
              <span className="flex items-center gap-2.5">
                <Users2 size={18} style={{ color: app.manifest.themeColor }} />
                <span className="font-semibold text-neutral-900">{membership.group.name}</span>
                {membership.role !== "MEMBER" && (
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                    Leader
                  </span>
                )}
              </span>
              <ChevronRight size={16} className="text-neutral-400" />
            </Link>
          ))}
        </div>
      </div>
    ) : undefined;

  return (
    <div className="mx-auto h-dvh max-w-md" style={{ backgroundColor: app.manifest.themeColor }}>
      <AppScreen
        manifest={app.manifest}
        organizationName={app.organizationName}
        content={content}
        activeIndex={activeIndex}
        tabHref={(i) => `/a/${publicAppId}?tab=${i}`}
        myGroupsNav={myGroupsNav}
        homeFeed={
          <AppFeed
            publicAppId={publicAppId}
            churchName={app.organizationName}
            accent={app.manifest.themeColor}
            posts={posts}
            member={member ? { personId: member.personId, displayName: member.displayName } : null}
            allowMemberPosts={app.manifest.allowMemberPosts}
            myGroups={myGroups.map((m) => ({ id: m.group.id, name: m.group.name }))}
            pushPublicKey={webPushPublicKey()}
          />
        }
      />
    </div>
  );
}
