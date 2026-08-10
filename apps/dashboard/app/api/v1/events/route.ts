import { NextRequest, NextResponse } from "next/server";
import { eventService } from "@cms/database";
import { authenticateApiRequest } from "../../../../lib/api-auth";

export const runtime = "nodejs";

/** Public API v1: published Events (BLUEPRINT §42) — same read model the public calendar uses. */
export async function GET(req: NextRequest) {
  const authed = await authenticateApiRequest(req);
  if (!authed.ok) return authed.response;

  const events = await eventService.listEvents(authed.auth.organizationId, { publishedOnly: true });
  return NextResponse.json({
    data: events.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      location: e.location,
      start_at: e.startAt.toISOString(),
      end_at: e.endAt?.toISOString() ?? null,
      all_day: e.allDay,
      recurrence: e.recurrence,
      recurrence_interval: e.recurrenceInterval,
      capacity: e.capacity,
      registered_count: e._count.registrations,
      public_id: e.publicId,
    })),
  });
}
