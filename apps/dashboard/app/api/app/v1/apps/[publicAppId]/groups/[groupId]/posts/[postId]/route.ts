import { NextResponse } from "next/server";
import { after } from "next/server";
import { groupSpaceService } from "@cms/database";
import { resolveAppRequest } from "../../../../../../../../../../lib/app-api-auth";
import { notifyPraying } from "../../../../../../../../../../lib/group-push";

export const runtime = "nodejs";

/** Post actions: {action: "pray"} (members) | {action: "hide"|"restore"} (leaders). */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ publicAppId: string; groupId: string; postId: string }> },
) {
  const { publicAppId, groupId, postId } = await params;
  const resolved = await resolveAppRequest(req, publicAppId);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!resolved.member) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const orgId = resolved.app.organizationId;

  try {
    const json = (await req.json()) as { action?: unknown };
    if (json.action === "pray") {
      await groupSpaceService.requireMember(orgId, groupId, resolved.member.personId);
      const praying = await groupSpaceService.togglePraying(orgId, postId, resolved.member.personId);
      const prayingPersonId = resolved.member.personId;
      if (praying) after(() => notifyPraying(orgId, postId, prayingPersonId));
      return NextResponse.json({ ok: true, praying }, { headers: { "cache-control": "no-store" } });
    }
    if (json.action === "hide" || json.action === "restore") {
      await groupSpaceService.requireLeader(orgId, groupId, resolved.member.personId);
      await groupSpaceService.setGroupPostHidden(orgId, postId, json.action === "hide");
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
