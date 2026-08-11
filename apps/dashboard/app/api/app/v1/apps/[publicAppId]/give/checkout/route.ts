import { NextResponse } from "next/server";
import { giftAmountError, onlineGivingService } from "@cms/database";
import { resolveAppRequest } from "../../../../../../../../lib/app-api-auth";
import { createGiveCheckoutSession } from "../../../../../../../../lib/stripe-checkout";

export const runtime = "nodejs";

/**
 * Start a Stripe Checkout for a gift: {amount_cents, fund_id, interval?: "month"}.
 * Guests may give too — a Bearer member token just links the gift to their
 * Person record via metadata. Returns {url} to redirect/open.
 */
export async function POST(req: Request, { params }: { params: Promise<{ publicAppId: string }> }) {
  const { publicAppId } = await params;
  const resolved = await resolveAppRequest(req, publicAppId);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const orgId = resolved.app.organizationId;

  try {
    const config = await onlineGivingService.getConfig(orgId);
    if (!onlineGivingService.isLive(config)) {
      return NextResponse.json({ error: "unavailable", message: "Online giving isn't set up." }, { status: 400 });
    }

    const json = (await req.json()) as { amount_cents?: unknown; fund_id?: unknown; interval?: unknown };
    const amountCents = typeof json.amount_cents === "number" ? json.amount_cents : NaN;
    const amountError = giftAmountError(amountCents);
    if (amountError) return NextResponse.json({ error: "invalid", message: amountError }, { status: 400 });

    const funds = await onlineGivingService.listOnlineFunds(orgId);
    const fund = funds.find((f) => f.id === json.fund_id) ?? funds[0];
    if (!fund) {
      return NextResponse.json({ error: "invalid", message: "No fund is open for online giving." }, { status: 400 });
    }

    const origin = new URL(req.url).origin;
    const session = await createGiveCheckoutSession(config!.stripeSecretKey!, {
      amountCents,
      currency: config!.currency,
      fundId: fund.id,
      fundName: fund.name,
      interval: json.interval === "month" ? "month" : null,
      personId: resolved.member?.personId ?? null,
      successUrl: `${origin}/a/${encodeURIComponent(publicAppId)}/give/thanks`,
      cancelUrl: `${origin}/a/${encodeURIComponent(publicAppId)}`,
    });
    return NextResponse.json({ url: session.url }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: "invalid", message: err instanceof Error ? err.message : "Could not start checkout" },
      { status: 400 },
    );
  }
}
