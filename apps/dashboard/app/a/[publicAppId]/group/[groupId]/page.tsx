import type { Metadata } from "next";
import { ArrowLeft, CalendarDays, MapPin } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { appMemberService, appService, groupSpaceService } from "@cms/database";
import { GroupSpaceView } from "../../../../../components/church-app/GroupSpaceView";

/**
 * A member's group space inside the church app (docs/domain/groups.md):
 * chat/links/prayer stream, group-only events with RSVP, polls, and the
 * leader toolkit. Members only — anyone else lands on sign-in or a 404.
 */

interface Props {
  params: Promise<{ publicAppId: string; groupId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { publicAppId } = await params;
  const app = await appService.resolvePublicApp(publicAppId);
  return app ? { title: `Groups — ${app.manifest.appName}` } : {};
}

export default async function GroupSpacePage({ params }: Props) {
  const { publicAppId, groupId } = await params;
  const app = await appService.resolvePublicApp(publicAppId);
  if (!app) notFound();

  const token = (await cookies()).get(`app_session_${publicAppId}`)?.value ?? "";
  const member = token ? await appMemberService.getSessionMember(app.organizationId, token) : null;
  if (!member) redirect(`/a/${publicAppId}/signin`);

  const space = await groupSpaceService.getGroupSpace(app.organizationId, groupId, member.personId);
  if (!space) notFound();

  const accent = app.manifest.themeColor;

  return (
    <div className="mx-auto flex h-dvh max-w-md flex-col bg-neutral-100">
      <header className="px-4 pb-4 pt-4 text-white" style={{ backgroundColor: accent }}>
        <Link
          href={`/a/${publicAppId}?tab=${Math.max(
            0,
            app.manifest.tabs.findIndex((t) => t.kind === "groups"),
          )}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-white/90"
        >
          <ArrowLeft size={15} /> {app.manifest.appName}
        </Link>
        <h1 className="mt-2 text-xl font-bold leading-tight">{space.group.name}</h1>
        {(space.group.meetingSchedule || space.group.meetingLocation) && (
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-white/85">
            {space.group.meetingSchedule && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays size={12} /> {space.group.meetingSchedule}
              </span>
            )}
            {space.group.meetingLocation && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={12} /> {space.group.meetingLocation}
              </span>
            )}
          </p>
        )}
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto p-4">
        <GroupSpaceView publicAppId={publicAppId} space={space} accent={accent} />
      </main>
    </div>
  );
}
