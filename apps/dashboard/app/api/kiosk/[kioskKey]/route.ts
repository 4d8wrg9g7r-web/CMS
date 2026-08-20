import { NextResponse } from "next/server";
import { kioskService } from "@cms/database";

export const runtime = "nodejs";

const NO_STORE = { "cache-control": "no-store" };

/**
 * Kiosk API (docs/domain/app.md "Check-in"). The unguessable kiosk key is the
 * credential; every operation resolves it fresh so a disabled kiosk dies
 * immediately. POST body: {op:"lookup", query} | {op:"checkin", eventId,
 * occurrenceAt, personIds} | {op:"checkout", personIds, securityCode}.
 */
export async function POST(req: Request, { params }: { params: Promise<{ kioskKey: string }> }) {
  const { kioskKey } = await params;
  const kiosk = await kioskService.resolveKiosk(kioskKey);
  if (!kiosk) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  try {
    if (body.op === "lookup") {
      const households = await kioskService.kioskHouseholdLookup(kiosk.organizationId, String(body.query ?? ""));
      return NextResponse.json(
        {
          households: households.map((h) => ({
            id: h.id,
            name: h.name,
            kids: h.kids.map((k) => ({ id: k.id, name: `${k.preferredName || k.firstName} ${k.lastName}`.trim() })),
          })),
        },
        { headers: NO_STORE },
      );
    }
    if (body.op === "checkin") {
      const occurrenceAt = new Date(String(body.occurrenceAt ?? ""));
      if (Number.isNaN(occurrenceAt.getTime())) return NextResponse.json({ error: "invalid" }, { status: 400 });
      const result = await kioskService.kioskCheckIn(kiosk.organizationId, {
        kioskId: kiosk.id,
        eventId: String(body.eventId ?? ""),
        occurrenceAt,
        personIds: Array.isArray(body.personIds) ? body.personIds.map(String) : [],
      });
      return NextResponse.json(result, { headers: NO_STORE });
    }
    if (body.op === "checkout") {
      // Pickup is decoupled from today's event list (UX audit #8): the open
      // check-in + code identify the pickup, so checkout still works after
      // the event has rolled off the kiosk's calendar day.
      const result = await kioskService.kioskCheckOutByCode(kiosk.organizationId, {
        personIds: Array.isArray(body.personIds) ? body.personIds.map(String) : [],
        securityCode: String(body.securityCode ?? ""),
      });
      return NextResponse.json(result, { status: result.ok ? 200 : 400, headers: NO_STORE });
    }
    return NextResponse.json({ error: "unknown_op" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: "invalid", message: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
}
