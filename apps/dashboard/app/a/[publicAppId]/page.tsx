import type { Metadata, Viewport } from "next";
import { ChevronRight, Users2 } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { appFeedService, appMemberService, appService, campaignService, givingService, groupService, onlineGivingService } from "@cms/database";
import { AppFeed } from "../../../components/church-app/AppFeed";
import { AppScreen } from "../../../components/church-app/AppScreen";
import { CampaignCard } from "../../../components/church-app/CampaignCard";
import { GiveOnlinePanel } from "../../../components/church-app/GiveOnlinePanel";
import { MyGivingPanel } from "../../../components/church-app/MyGivingPanel";
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

  const [content, posts, myGroups, givingConfig] = await Promise.all([
    buildAppContent(app.organizationId),
    appFeedService.listFeed(app.organizationId, member?.personId ?? null),
    member ? groupService.listGroupsForPerson(app.organizationId, member.personId) : Promise.resolve([]),
    onlineGivingService.getConfig(app.organizationId),
  ]);
  const givingLive = onlineGivingService.isLive(givingConfig);
  const [onlineFunds, campaigns] = await Promise.all([
    givingLive ? onlineGivingService.listOnlineFunds(app.organizationId) : Promise.resolve([]),
    campaignService.listActiveCampaignsForApp(app.organizationId, member?.personId ?? null),
  ]);
  // The member's own giving (any method) + recurring schedules, for the Give tab.
  const [myGifts, myRecurring] = member
    ? await Promise.all([
        givingService.listContributionsForPerson(app.organizationId, member.personId, 10),
        onlineGivingService.listRecurringGiftsForPerson(app.organizationId, member.personId),
      ])
    : [[], []];

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
        givingPanel={
          (givingLive && onlineFunds.length > 0) || campaigns.length > 0 ? (
            <>
              {campaigns.map((campaign) => (
                <CampaignCard
                  key={campaign.id}
                  publicAppId={publicAppId}
                  accent={app.manifest.themeColor}
                  signedIn={Boolean(member)}
                  campaign={{
                    id: campaign.id,
                    name: campaign.name,
                    description: campaign.description,
                    fundName: campaign.fundName,
                    goalCents: campaign.goalCents,
                    raisedCents: campaign.raisedCents,
                    pledgedCents: campaign.pledgedCents,
                    pledgeCount: campaign.pledgeCount,
                    endsAt: campaign.endsAt,
                    myPledgeCents: campaign.myPledgeCents,
                    myGivenCents: campaign.myGivenCents,
                  }}
                />
              ))}
              {givingLive && onlineFunds.length > 0 && (
                <GiveOnlinePanel
                  publicAppId={publicAppId}
                  funds={onlineFunds.map((f) => ({ id: f.id, name: f.name }))}
                  accent={app.manifest.themeColor}
                  bankEnabled={Boolean(givingConfig?.achEnabled)}
                />
              )}
              {member && (
                <MyGivingPanel
                  publicAppId={publicAppId}
                  accent={app.manifest.themeColor}
                  history={myGifts.map((c) => ({
                    id: c.id,
                    amountCents: c.amountCents,
                    fundName: c.fund.name,
                    method: c.method,
                    receivedAt: c.receivedAt.toISOString(),
                  }))}
                  recurring={myRecurring.map((r) => ({
                    subscriptionId: r.subscriptionId,
                    amountCents: r.amountCents,
                    interval: r.interval,
                    fundName: r.fund?.name ?? null,
                  }))}
                />
              )}
            </>
          ) : undefined
        }
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
