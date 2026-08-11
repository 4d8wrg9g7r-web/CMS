import { NextResponse } from "next/server";
import { groupSpaceService } from "@cms/database";
import { resolveAppRequest } from "../../../../../../../../../../lib/app-api-auth";

export const runtime = "nodejs";

/** Event actions: {action:"rsvp", status} (members) | {action:"attendance", entries} | {action:"archive"} (leaders). */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ publicAppId: string; groupId: string; eventId: string }> },
) {
  const { publicAppId, groupId, eventId } = await params;
  const resolved = await resolveAppRequest(req, publicAppId);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!resolved.member) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const orgId = resolved.app.organizationId;

  try {
    const json = (await req.json()) as { action?: unknown; status?: unknown; entries?: unknown };
    if (json.action === "rsvp") {
      await groupSpaceService.requireMember(orgId, groupId, resolved.member.personId);
      await groupSpaceService.setRsvp(orgId, eventId, resolved.member.personId, String(json.status ?? ""));
      return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
    }
    if (json.action === "attendance") {
      await groupSpaceService.requireLeader(orgId, groupId, resolved.member.personId);
      const entries = Array.isArray(json.entries)
        ? json.entries
            .map((e) => e as { person_id?: unknown; attended?: unknown })
            .filter((e) => typeof e.person_id === "string")
            .map((e) => ({ personId: e.person_id as string, attended: e.attended === true }))
        : [];
      await groupSpaceService.markAttendance(orgId, eventId, entries);
      return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
    }
    if (json.action === "archive") {
      await groupSpaceService.requireLeader(orgId, groupId, resolved.member.personId);
      await groupSpaceService.archiveGroupEvent(orgId, eventId);
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
