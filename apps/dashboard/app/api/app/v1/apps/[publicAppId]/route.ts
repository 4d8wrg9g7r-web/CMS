import { NextResponse } from "next/server";
import { appFeedService, appService } from "@cms/database";
import { buildAppContent } from "../../../../../../lib/church-app-content";

export const runtime = "nodejs";

/**
 * Full app payload for one church: manifest + content, exactly what the web
 * surface renders. The native container and white-label shells are thin
 * renderers over this response — additions here must stay backward-compatible
 * (additive) once native clients ship. Unauthenticated: public content only,
 * gated on the app's enabled flag via resolvePublicApp.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ publicAppId: string }> }) {
  const { publicAppId } = await params;
  const app = await appService.resolvePublicApp(publicAppId);
  if (!app) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [content, feed] = await Promise.all([
    buildAppContent(app.organizationId),
    // Signed-out feed view (church announcements). Member posts require an
    // app-member session, which this keyless API deliberately does not carry.
    appFeedService.listFeed(app.organizationId, null),
  ]);
  return NextResponse.json(
    {
      data: {
        public_app_id: publicAppId,
        organization_name: app.organizationName,
        manifest: app.manifest,
        content,
        feed,
      },
    },
    { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
