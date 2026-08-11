import { NextResponse } from "next/server";
import { appFeedService, groupService } from "@cms/database";
import { buildAppContent } from "../../../../../../lib/church-app-content";
import { memberJson, resolveAppRequest } from "../../../../../../lib/app-api-auth";

export const runtime = "nodejs";

/**
 * Full app payload for one church: manifest + content, exactly what the web
 * surface renders. The native container and white-label shells are thin
 * renderers over this response — additions here must stay backward-compatible
 * (additive) once native clients ship.
 *
 * Without Authorization: public content + the signed-out feed, cacheable.
 * With a Bearer member token (issued by auth/verify): the feed personalizes
 * (member posts + the viewer's groups), and `member` + `my_groups` are
 * included — response becomes no-store.
 */
export async function GET(req: Request, { params }: { params: Promise<{ publicAppId: string }> }) {
  const { publicAppId } = await params;
  const resolved = await resolveAppRequest(req, publicAppId);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { app, member } = resolved;

  const [content, feed, memberships] = await Promise.all([
    buildAppContent(app.organizationId),
    appFeedService.listFeed(app.organizationId, member?.personId ?? null),
    member ? groupService.listGroupsForPerson(app.organizationId, member.personId) : Promise.resolve([]),
  ]);

  return NextResponse.json(
    {
      data: {
        public_app_id: publicAppId,
        organization_name: app.organizationName,
        manifest: app.manifest,
        content,
        feed,
        ...(member
          ? {
              member: memberJson(member),
              my_groups: memberships.map((m) => ({ id: m.group.id, name: m.group.name })),
            }
          : {}),
      },
    },
    {
      headers: {
        "cache-control": member ? "no-store" : "public, s-maxage=60, stale-while-revalidate=300",
        ...(member ? {} : { vary: "authorization" }),
      },
    },
  );
}
