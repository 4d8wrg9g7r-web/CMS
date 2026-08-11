import { NextResponse } from "next/server";
import { groupSpaceService } from "@cms/database";
import { resolveAppRequest } from "../../../../../../../../lib/app-api-auth";

export const runtime = "nodejs";

/** The full group space payload — members of the group only. */
export async function GET(req: Request, { params }: { params: Promise<{ publicAppId: string; groupId: string }> }) {
  const { publicAppId, groupId } = await params;
  const resolved = await resolveAppRequest(req, publicAppId);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!resolved.member) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const space = await groupSpaceService.getGroupSpace(resolved.app.organizationId, groupId, resolved.member.personId);
  if (!space) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ data: space }, { headers: { "cache-control": "no-store" } });
}
