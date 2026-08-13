import { NextResponse } from "next/server";
import { livestreamChatService } from "@cms/database";
import { resolveAppRequest } from "../../../../../../../lib/app-api-auth";

export const runtime = "nodejs";

const NO_STORE = { "cache-control": "no-store" };

function messageJson(m: Awaited<ReturnType<typeof livestreamChatService.listChatMessages>>[number]) {
  return {
    id: m.id,
    person_id: m.personId,
    display_name: m.displayName,
    body: m.body,
    role: m.role,
    created_at: m.createdAt.toISOString(),
  };
}

/** Poll the livestream chat: ?after=<message id> returns strictly newer messages. */
export async function GET(req: Request, { params }: { params: Promise<{ publicAppId: string }> }) {
  const { publicAppId } = await params;
  const resolved = await resolveAppRequest(req, publicAppId);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const afterId = new URL(req.url).searchParams.get("after") ?? undefined;
  const messages = await livestreamChatService.listChatMessages(resolved.app.organizationId, { afterId });
  const viewerRole = resolved.member
    ? await livestreamChatService.getChatRole(resolved.app.organizationId, resolved.member.personId)
    : null;

  return NextResponse.json(
    {
      messages: messages.map(messageJson),
      slow_mode_seconds: resolved.app.chatSlowModeSeconds,
      viewer: resolved.member
        ? { person_id: resolved.member.personId, display_name: resolved.member.displayName, role: viewerRole }
        : null,
    },
    { headers: NO_STORE },
  );
}

/** Post a chat message (signed-in members). */
export async function POST(req: Request, { params }: { params: Promise<{ publicAppId: string }> }) {
  const { publicAppId } = await params;
  const resolved = await resolveAppRequest(req, publicAppId);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!resolved.member) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body = "";
  try {
    const json = (await req.json()) as { body?: unknown };
    body = typeof json.body === "string" ? json.body : "";
  } catch {
    /* fall through to validation */
  }

  const result = await livestreamChatService.postChatMessage(resolved.app.organizationId, {
    personId: resolved.member.personId,
    displayName: resolved.member.displayName,
    body,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, message: result.message, wait_seconds: result.waitSeconds ?? 0 },
      { status: result.error === "slow_mode" ? 429 : 400, headers: NO_STORE },
    );
  }
  return NextResponse.json({ ok: true, message_id: result.id }, { headers: NO_STORE });
}
