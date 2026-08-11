import { NextResponse } from "next/server";
import { appFeedService } from "@cms/database";
import { resolveAppRequest } from "../../../../../../../../../lib/app-api-auth";

export const runtime = "nodejs";

/** Set/toggle the member's reaction (same emoji = off, different = replace). */
export async function POST(req: Request, { params }: { params: Promise<{ publicAppId: string; postId: string }> }) {
  const { publicAppId, postId } = await params;
  const resolved = await resolveAppRequest(req, publicAppId);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!resolved.member) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let emoji = "";
  try {
    const json = (await req.json()) as { emoji?: unknown };
    emoji = typeof json.emoji === "string" ? json.emoji : "";
  } catch {
    /* fall through */
  }

  try {
    const myReaction = await appFeedService.setReaction(
      resolved.app.organizationId,
      resolved.member.personId,
      postId,
      emoji,
    );
    return NextResponse.json({ ok: true, my_reaction: myReaction }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: "invalid", message: err instanceof Error ? err.message : "Could not react" },
      { status: 400 },
    );
  }
}
