import { NextRequest, NextResponse } from "next/server";
import { appService } from "@cms/database";

export const runtime = "nodejs";

/**
 * Church-app content API (docs/domain/app.md) — unauthenticated by design: it
 * serves only what the public /a surfaces already render. This is the contract
 * the native container app (and later white-label builds) consume; the web
 * container at /a is one client of the same data.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  const entries = await appService.searchDirectory(q);
  return NextResponse.json(
    {
      data: entries.map((e) => ({
        public_app_id: e.publicAppId,
        app_name: e.appName,
        theme_color: e.themeColor,
        logo_url: e.logoUrl,
        organization_name: e.organizationName,
      })),
    },
    { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
