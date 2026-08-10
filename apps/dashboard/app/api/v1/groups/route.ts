import { NextRequest, NextResponse } from "next/server";
import { groupService } from "@cms/database";
import { authenticateApiRequest } from "../../../../lib/api-auth";

export const runtime = "nodejs";

/** Public API v1: Groups (BLUEPRINT §42). Definitions only — membership stays out of the read model. */
export async function GET(req: NextRequest) {
  const authed = await authenticateApiRequest(req);
  if (!authed.ok) return authed.response;

  const groups = await groupService.listGroups(authed.auth.organizationId, {});
  return NextResponse.json({
    data: groups.map((g) => ({
      id: g.id,
      name: g.name,
      type: g.type,
      description: g.description,
      enrollment: g.enrollment,
      meeting_schedule: g.meetingSchedule,
      meeting_location: g.meetingLocation,
      capacity: g.capacity,
      member_count: g._count.memberships,
      is_published: g.isPublished,
    })),
  });
}
