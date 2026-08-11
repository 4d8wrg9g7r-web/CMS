import { NextResponse } from "next/server";
import { groupSpaceService } from "@cms/database";
import { resolveAppRequest } from "../../../../../../../../../../lib/app-api-auth";

export const runtime = "nodejs";

/** Poll actions: {action:"vote", option_index} (members) | {action:"close"} (leaders). */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ publicAppId: string; groupId: string; pollId: string }> },
) {
  const { publicAppId, groupId, pollId } = await params;
  const resolved = await resolveAppRequest(req, publicAppId);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!resolved.member) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const orgId = resolved.app.organizationId;

  try {
    const json = (await req.json()) as { action?: unknown; option_index?: unknown };
    if (json.action === "vote") {
      await groupSpaceService.requireMember(orgId, groupId, resolved.member.personId);
      await groupSpaceService.votePoll(orgId, pollId, resolved.member.personId, Number(json.option_index));
      return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
    }
    if (json.action === "close") {
      await groupSpaceService.requireLeader(orgId, groupId, resolved.member.personId);
      await groupSpaceService.closeGroupPoll(orgId, pollId);
      return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: "invalid", message: err instanceof Error ? err.message : "Could not update" },
      { status: 400 },
    );
  }
}
