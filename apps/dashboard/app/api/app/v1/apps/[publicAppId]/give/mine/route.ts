import { NextResponse } from "next/server";
import { givingService, onlineGivingService } from "@cms/database";
import { resolveAppRequest } from "../../../../../../../../lib/app-api-auth";

export const runtime = "nodejs";

/**
 * The signed-in member's giving: recent gifts (all methods — checks counted on
 * Sunday show up too) and active recurring schedules. Strictly their own
 * records — the personId comes from the session, never from input.
 */
export async function GET(req: Request, { params }: { params: Promise<{ publicAppId: string }> }) {
  const { publicAppId } = await params;
  const resolved = await resolveAppRequest(req, publicAppId);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!resolved.member) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const orgId = resolved.app.organizationId;

  const [history, recurring] = await Promise.all([
    givingService.listContributionsForPerson(orgId, resolved.member.personId, 25),
    onlineGivingService.listRecurringGiftsForPerson(orgId, resolved.member.personId),
  ]);

  return NextResponse.json(
    {
      data: {
        history: history.map((c) => ({
          id: c.id,
          amount_cents: c.amountCents,
          fund_name: c.fund.name,
          method: c.method,
          received_at: c.receivedAt.toISOString(),
        })),
        recurring: recurring.map((r) => ({
          subscription_id: r.subscriptionId,
          amount_cents: r.amountCents,
          interval: r.interval,
          fund_name: r.fund?.name ?? null,
          last_payment_at: r.lastPaymentAt?.toISOString() ?? null,
        })),
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
