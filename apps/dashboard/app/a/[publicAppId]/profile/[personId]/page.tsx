import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Users2 } from "lucide-react";
import { appFeedService, appMemberService, appService } from "@cms/database";
import { AppFeed } from "../../../../../components/church-app/AppFeed";
import { AvatarUploader } from "../../../../../components/church-app/AvatarUploader";

/**
 * Member profile inside the church app (docs/domain/app.md): members viewing
 * members, so a signed-in session is required. Shows photo, name, groups, and
 * the posts of theirs the VIEWER is allowed to see (same visibility rules as
 * the feed). Never contact info.
 */
export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ publicAppId: string; personId: string }>;
}) {
  const { publicAppId, personId } = await params;
  const app = await appService.resolvePublicApp(publicAppId);
  if (!app) notFound();

  const token = (await cookies()).get(`app_session_${publicAppId}`)?.value ?? "";
  const viewer = token ? await appMemberService.getSessionMember(app.organizationId, token) : null;
  if (!viewer) redirect(`/a/${publicAppId}/signin`);

  const [profile, posts] = await Promise.all([
    appMemberService.getMemberProfile(app.organizationId, personId),
    appFeedService.listFeed(app.organizationId, viewer.personId, { authorPersonId: personId }),
  ]);
  if (!profile) notFound();

  const isSelf = viewer.personId === personId;
  const accent = app.manifest.themeColor;

  return (
    <div className="min-h-dvh bg-neutral-100">
      <div className="mx-auto max-w-md px-4 py-6">
        <Link
          href={`/a/${publicAppId}`}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-800"
        >
          <ArrowLeft size={14} /> Back to {app.manifest.appName}
        </Link>

        <div className="rounded-2xl border border-neutral-200 bg-white p-5 text-center">
          {profile.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- member-uploaded avatar
            <img src={profile.photoUrl} alt="" className="mx-auto h-20 w-20 rounded-full object-cover" />
          ) : (
            <span
              className="mx-auto flex h-20 w-20 items-center justify-center rounded-full text-3xl font-bold text-white"
              style={{ backgroundColor: "#8a8985" }}
            >
              {profile.displayName.charAt(0).toUpperCase()}
            </span>
          )}
          <h1 className="mt-3 text-xl font-bold tracking-tight text-neutral-900">{profile.displayName}</h1>
          <p className="mt-0.5 text-xs text-neutral-500">
            Part of {app.organizationName} since {new Date(profile.memberSince).getFullYear()}
          </p>
          {isSelf && (
            <div className="mt-3 flex justify-center">
              <AvatarUploader publicAppId={publicAppId} accent={accent} />
            </div>
          )}
          {profile.groups.length > 0 && (
            <div className="mt-4 flex flex-wrap justify-center gap-1.5">
              {profile.groups.map((group) => (
                <span
                  key={group.id}
                  className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-700"
                >
                  <Users2 size={11} /> {group.name}
                </span>
              ))}
            </div>
          )}
        </div>

        <p className="mb-2 mt-6 text-xs font-bold uppercase tracking-wide text-neutral-500">
          {isSelf ? "Your posts" : "Posts"}
        </p>
        <AppFeed
          publicAppId={publicAppId}
          churchName={app.organizationName}
          accent={accent}
          posts={posts}
          member={{ personId: viewer.personId, displayName: viewer.displayName }}
          allowMemberPosts={false}
          myGroups={[]}
          chromeless
        />
      </div>
    </div>
  );
}
