import { appService } from "@cms/database";

/**
 * Per-church PWA manifest: makes /a/<id> installable with the church's own name,
 * color, and icon. iOS leans on the apple-touch-icon/meta set in the page's
 * metadata; Android/Chrome reads this document.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ publicAppId: string }> }) {
  const { publicAppId } = await params;
  const app = await appService.resolvePublicApp(publicAppId);
  if (!app) return new Response("Not found", { status: 404 });

  const icons = app.manifest.logoUrl
    ? [{ src: app.manifest.logoUrl, sizes: "any", type: "image/png" }]
    : [{ src: "/icon", sizes: "any", type: "image/png" }];

  return Response.json(
    {
      name: app.manifest.appName,
      short_name: app.manifest.appName.slice(0, 12),
      start_url: `/a/${publicAppId}`,
      scope: `/a/${publicAppId}`,
      display: "standalone",
      background_color: "#f5f5f3",
      theme_color: app.manifest.themeColor,
      icons,
    },
    { headers: { "content-type": "application/manifest+json" } },
  );
}
