import { NextResponse } from "next/server";
import { after } from "next/server";
import { groupSpaceService, personDisplayName } from "@cms/database";
import { resolveAppRequest } from "../../../../../../../../../lib/app-api-auth";
import { notifyGroupPost } from "../../../../../../../../../lib/group-push";

export const runtime = "nodejs";

/** Post to the group stream: {kind: MESSAGE|LINK|PRAYER, body, url?, anonymous?}. Members only. */
export async function POST(req: Request, { params }: { params: Promise<{ publicAppId: string; groupId: string }> }) {
  const { publicAppId, groupId } = await params;
  const resolved = await resolveAppRequest(req, publicAppId);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!resolved.member) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    await groupSpaceService.requireMember(resolved.app.organizationId, groupId, resolved.member.personId);
    const json = (await req.json()) as { kind?: unknown; body?: unknown; url?: unknown; anonymous?: unknown };
    const kind = json.kind === "LINK" ? "LINK" : json.kind === "PRAYER" ? "PRAYER" : "MESSAGE";
    const post = await groupSpaceService.createGroupPost(resolved.app.organizationId, groupId, {
      kind,
      body: typeof json.body === "string" ? json.body : "",
      url: typeof json.url === "string" ? json.url : null,
      anonymous: json.anonymous === true,
      personId: resolved.member.personId,
    });
    const orgId = resolved.app.organizationId;
    after(() =>
      notifyGroupPost(orgId, groupId, {
        kind,
        body: post.body,
        anonymous: post.anonymous,
        authorPersonId: post.personId,
        authorName: post.person ? personDisplayName(post.person) : null,
      }),
    );
    return NextResponse.json({ ok: true, post_id: post.id }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: "invalid", message: err instanceof Error ? err.message : "Could not post" },
      { status: 400 },
    );
  }
}
