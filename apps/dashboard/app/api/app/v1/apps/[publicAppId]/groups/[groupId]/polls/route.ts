import { NextResponse } from "next/server";
import { after } from "next/server";
import { groupSpaceService } from "@cms/database";
import { resolveAppRequest } from "../../../../../../../../../lib/app-api-auth";
import { notifyGroupPoll } from "../../../../../../../../../lib/group-push";

export const runtime = "nodejs";

/** Create a poll (leaders): {question, options: string[]}. */
export async function POST(req: Request, { params }: { params: Promise<{ publicAppId: string; groupId: string }> }) {
  const { publicAppId, groupId } = await params;
  const resolved = await resolveAppRequest(req, publicAppId);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!resolved.member) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    await groupSpaceService.requireLeader(resolved.app.organizationId, groupId, resolved.member.personId);
    const json = (await req.json()) as { question?: unknown; options?: unknown };
    const poll = await groupSpaceService.createGroupPoll(resolved.app.organizationId, groupId, {
      question: typeof json.question === "string" ? json.question : "",
      options: Array.isArray(json.options) ? json.options.filter((o): o is string => typeof o === "string") : [],
      createdByPersonId: resolved.member.personId,
    });
    const orgId = resolved.app.organizationId;
    after(() => notifyGroupPoll(orgId, groupId, { question: poll.question, createdByPersonId: poll.createdByPersonId }));
    return NextResponse.json({ ok: true, poll_id: poll.id }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: "invalid", message: err instanceof Error ? err.message : "Could not create the poll" },
      { status: 400 },
    );
  }
}
