import { NextResponse } from "next/server";
import { groupService } from "@cms/database";
import { memberJson, resolveAppRequest } from "../../../../../../../lib/app-api-auth";

export const runtime = "nodejs";

/** The signed-in member (401 without a live session) plus their groups. */
export async function GET(req: Request, { params }: { params: Promise<{ publicAppId: string }> }) {
  const { publicAppId } = await params;
  const resolved = await resolveAppRequest(req, publicAppId);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!resolved.member) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const memberships = await groupService.listGroupsForPerson(resolved.app.organizationId, resolved.member.personId);
  return NextResponse.json(
    {
      member: memberJson(resolved.member),
      my_groups: memberships.map((m) => ({ id: m.group.id, name: m.group.name })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
