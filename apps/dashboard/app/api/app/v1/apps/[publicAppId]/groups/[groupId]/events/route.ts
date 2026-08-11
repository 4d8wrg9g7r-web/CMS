import { NextResponse } from "next/server";
import { after } from "next/server";
import { groupSpaceService } from "@cms/database";
import { resolveAppRequest } from "../../../../../../../../../lib/app-api-auth";
import { notifyGroupEvent } from "../../../../../../../../../lib/group-push";

export const runtime = "nodejs";

/** Create a group event (leaders): {title, description?, location?, start_at, end_at?}. */
export async function POST(req: Request, { params }: { params: Promise<{ publicAppId: string; groupId: string }> }) {
  const { publicAppId, groupId } = await params;
  const resolved = await resolveAppRequest(req, publicAppId);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!resolved.member) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    await groupSpaceService.requireLeader(resolved.app.organizationId, groupId, resolved.member.personId);
    const json = (await req.json()) as {
      title?: unknown;
      description?: unknown;
      location?: unknown;
      start_at?: unknown;
      end_at?: unknown;
    };
    const event = await groupSpaceService.createGroupEvent(resolved.app.organizationId, groupId, {
      title: typeof json.title === "string" ? json.title : "",
      description: typeof json.description === "string" ? json.description : null,
      location: typeof json.location === "string" ? json.location : null,
      startAt: new Date(typeof json.start_at === "string" ? json.start_at : ""),
      endAt: typeof json.end_at === "string" && json.end_at ? new Date(json.end_at) : null,
      createdByPersonId: resolved.member.personId,
    });
    const orgId = resolved.app.organizationId;
    after(() => notifyGroupEvent(orgId, groupId, { title: event.title, createdByPersonId: event.createdByPersonId }));
    return NextResponse.json({ ok: true, event_id: event.id }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: "invalid", message: err instanceof Error ? err.message : "Could not create the event" },
      { status: 400 },
    );
  }
}
