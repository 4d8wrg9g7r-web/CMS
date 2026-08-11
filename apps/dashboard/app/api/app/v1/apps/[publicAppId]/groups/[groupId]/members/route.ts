import { NextResponse } from "next/server";
import { groupSpaceService } from "@cms/database";
import { resolveAppRequest } from "../../../../../../../../../lib/app-api-auth";

export const runtime = "nodejs";

/**
 * Member management (leaders): {action:"add", email, first_name?, last_name?}
 * — matches an existing person by email or creates a lightweight VISITOR —
 * or {action:"remove", person_id}.
 */
export async function POST(req: Request, { params }: { params: Promise<{ publicAppId: string; groupId: string }> }) {
  const { publicAppId, groupId } = await params;
  const resolved = await resolveAppRequest(req, publicAppId);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!resolved.member) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const orgId = resolved.app.organizationId;

  try {
    await groupSpaceService.requireLeader(orgId, groupId, resolved.member.personId);
    const json = (await req.json()) as {
      action?: unknown;
      email?: unknown;
      first_name?: unknown;
      last_name?: unknown;
      person_id?: unknown;
    };
    if (json.action === "add") {
      const result = await groupSpaceService.addMemberByEmail(orgId, groupId, {
        email: typeof json.email === "string" ? json.email : "",
        firstName: typeof json.first_name === "string" ? json.first_name : null,
        lastName: typeof json.last_name === "string" ? json.last_name : null,
      });
      return NextResponse.json(
        { ok: true, person_id: result.personId, created: result.created },
        { headers: { "cache-control": "no-store" } },
      );
    }
    if (json.action === "remove") {
      const personId = typeof json.person_id === "string" ? json.person_id : "";
      if (personId === resolved.member.personId) {
        return NextResponse.json({ error: "invalid", message: "Leaders can't remove themselves." }, { status: 400 });
      }
      await groupSpaceService.removeMember(orgId, groupId, personId);
      return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: "invalid", message: err instanceof Error ? err.message : "Could not update members" },
      { status: 400 },
    );
  }
}
