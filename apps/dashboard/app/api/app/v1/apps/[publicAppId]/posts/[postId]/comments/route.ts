import { NextResponse } from "next/server";
import { appFeedService } from "@cms/database";
import { resolveAppRequest } from "../../../../../../../../../lib/app-api-auth";

export const runtime = "nodejs";

/** Add a comment (or a single-level reply via parent_comment_id). */
export async function POST(req: Request, { params }: { params: Promise<{ publicAppId: string; postId: string }> }) {
  const { publicAppId, postId } = await params;
  const resolved = await resolveAppRequest(req, publicAppId);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!resolved.member) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body = "";
  let parentCommentId: string | null = null;
  try {
    const json = (await req.json()) as { body?: unknown; parent_comment_id?: unknown };
    body = typeof json.body === "string" ? json.body : "";
    parentCommentId = typeof json.parent_comment_id === "string" && json.parent_comment_id ? json.parent_comment_id : null;
  } catch {
    /* fall through */
  }

  try {
    const comment = await appFeedService.addComment(
      resolved.app.organizationId,
      resolved.member.personId,
      postId,
      body,
      { parentCommentId },
    );
    return NextResponse.json({ ok: true, comment_id: comment.id }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: "invalid", message: err instanceof Error ? err.message : "Could not comment" },
      { status: 400 },
    );
  }
}
