import { NextResponse } from "next/server";
import { groupService, groupSpaceService } from "@cms/database";
import { resolveAppRequest } from "../../../../../../../lib/app-api-auth";

export const runtime = "nodejs";

/** The signed-in member's groups (401 without a session). */
export async function GET(req: Request, { params }: { params: Promise<{ publicAppId: string }> }) {
  const { publicAppId } = await params;
  const resolved = await resolveAppRequest(req, publicAppId);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!resolved.member) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const memberships = await groupService.listGroupsForPerson(resolved.app.organizationId, resolved.member.personId);
  return NextResponse.json(
    {
      data: memberships.map((m) => ({
        id: m.group.id,
        name: m.group.name,
        role: m.role,
        is_leader: groupSpaceService.isLeaderRole(m.role),
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
