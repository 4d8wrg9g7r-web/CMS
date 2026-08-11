import { NextResponse } from "next/server";
import { appMemberService, appService } from "@cms/database";
import { bearerToken } from "../../../../../../../../lib/app-api-auth";

export const runtime = "nodejs";

/** Revoke this device's session token. Idempotent. */
export async function POST(req: Request, { params }: { params: Promise<{ publicAppId: string }> }) {
  const { publicAppId } = await params;
  const app = await appService.resolvePublicApp(publicAppId);
  if (!app) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await appMemberService.signOut(app.organizationId, bearerToken(req));
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
