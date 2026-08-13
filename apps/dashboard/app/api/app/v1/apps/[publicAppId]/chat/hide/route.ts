import { NextResponse } from "next/server";
import { livestreamChatService } from "@cms/database";
import { resolveAppRequest } from "../../../../../../../../lib/app-api-auth";

export const runtime = "nodejs";

/** Hide a chat message — signed-in members holding a HOST or MODERATOR role. */
export async function POST(req: Request, { params }: { params: Promise<{ publicAppId: string }> }) {
  const { publicAppId } = await params;
  const resolved = await resolveAppRequest(req, publicAppId);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!resolved.member) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const role = await livestreamChatService.getChatRole(resolved.app.organizationId, resolved.member.personId);
  if (!role) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let messageId = "";
  try {
    const json = (await req.json()) as { message_id?: unknown };
    messageId = typeof json.message_id === "string" ? json.message_id : "";
  } catch {
    /* fall through */
  }
  if (!messageId) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const hidden = await livestreamChatService.setChatMessageHidden(resolved.app.organizationId, messageId, true);
  if (!hidden) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
