import { NextResponse } from "next/server";
import { kioskService } from "@cms/database";
import { resolveAppRequest } from "../../../../../../../lib/app-api-auth";

export const runtime = "nodejs";

/**
 * Member self check-in (docs/domain/app.md "Check-in"): events with
 * allowAppCheckIn accept a signed-in member's check-in from an hour before
 * the occurrence until it ends. Coordinates are optional — sent only when
 * the member grants the browser's location prompt at the moment of check-in.
 */
export async function POST(req: Request, { params }: { params: Promise<{ publicAppId: string }> }) {
  const { publicAppId } = await params;
  const resolved = await resolveAppRequest(req, publicAppId);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!resolved.member) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { event_id?: unknown; occurrence_at?: unknown; latitude?: unknown; longitude?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const occurrenceAt = new Date(String(body.occurrence_at ?? ""));
  if (typeof body.event_id !== "string" || !body.event_id || Number.isNaN(occurrenceAt.getTime())) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const result = await kioskService.appSelfCheckIn(resolved.app.organizationId, {
    eventId: body.event_id,
    occurrenceAt,
    personId: resolved.member.personId,
    latitude: typeof body.latitude === "number" && Number.isFinite(body.latitude) ? body.latitude : null,
    longitude: typeof body.longitude === "number" && Number.isFinite(body.longitude) ? body.longitude : null,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400, headers: { "cache-control": "no-store" } });
}
