import { NextResponse } from "next/server";
import { appFeedService } from "@cms/database";
import { resolveAppRequest } from "../../../../../../../lib/app-api-auth";

export const runtime = "nodejs";

/** Create a member post (native composer): text, optional image_url from the photos endpoint, optional group audience. */
export async function POST(req: Request, { params }: { params: Promise<{ publicAppId: string }> }) {
  const { publicAppId } = await params;
  const resolved = await resolveAppRequest(req, publicAppId);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!resolved.member) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!resolved.app.manifest.allowMemberPosts) {
    return NextResponse.json({ error: "posting_disabled" }, { status: 403 });
  }

  let body = "";
  let groupId: string | null = null;
  let imageUrl: string | null = null;
  try {
    const json = (await req.json()) as { body?: unknown; group_id?: unknown; image_url?: unknown };
    body = typeof json.body === "string" ? json.body : "";
    groupId = typeof json.group_id === "string" && json.group_id ? json.group_id : null;
    imageUrl = typeof json.image_url === "string" && json.image_url ? json.image_url : null;
  } catch {
    /* fall through */
  }

  try {
    const post = await appFeedService.createMemberPost(resolved.app.organizationId, resolved.member.personId, {
      body,
      groupId,
      imageUrl,
    });
    return NextResponse.json({ ok: true, post_id: post.id }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: "invalid", message: err instanceof Error ? err.message : "Could not post" },
      { status: 400 },
    );
  }
}
