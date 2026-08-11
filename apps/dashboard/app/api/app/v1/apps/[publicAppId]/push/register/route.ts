import { NextResponse } from "next/server";
import { appPushService } from "@cms/database";
import { resolveAppRequest } from "../../../../../../../../lib/app-api-auth";

export const runtime = "nodejs";

/** Register this native device for announcement push (Bearer; Expo push token). */
export async function POST(req: Request, { params }: { params: Promise<{ publicAppId: string }> }) {
  const { publicAppId } = await params;
  const resolved = await resolveAppRequest(req, publicAppId);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!resolved.member) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let token = "";
  try {
    const json = (await req.json()) as { expo_push_token?: unknown };
    token = typeof json.expo_push_token === "string" ? json.expo_push_token : "";
  } catch {
    /* fall through */
  }

  try {
    await appPushService.saveExpoToken(resolved.app.organizationId, resolved.member.personId, token);
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: "invalid", message: err instanceof Error ? err.message : "Could not register" },
      { status: 400 },
    );
  }
}
