import { NextResponse } from "next/server";
import { campaignService } from "@cms/database";
import { resolveAppRequest } from "../../../../../../../../lib/app-api-auth";

export const runtime = "nodejs";

/** Make or update the signed-in member's pledge: {campaign_id, amount_cents}. */
export async function POST(req: Request, { params }: { params: Promise<{ publicAppId: string }> }) {
  const { publicAppId } = await params;
  const resolved = await resolveAppRequest(req, publicAppId);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!resolved.member) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const json = (await req.json()) as { campaign_id?: unknown; amount_cents?: unknown };
    if (typeof json.campaign_id !== "string" || !json.campaign_id) {
      return NextResponse.json({ error: "invalid", message: "Missing campaign." }, { status: 400 });
    }
    await campaignService.upsertPledge(
      resolved.app.organizationId,
      json.campaign_id,
      resolved.member.personId,
      typeof json.amount_cents === "number" ? json.amount_cents : NaN,
    );
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: "invalid", message: err instanceof Error ? err.message : "Could not save your pledge" },
      { status: 400 },
    );
  }
}
