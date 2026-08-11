import { NextResponse } from "next/server";
import { onlineGivingService } from "@cms/database";
import { resolveAppRequest } from "../../../../../../../../../lib/app-api-auth";
import { cancelStripeSubscription } from "../../../../../../../../../lib/stripe-checkout";

export const runtime = "nodejs";

/**
 * Cancel a recurring gift: {action:"cancel"}. Ownership is enforced by the
 * personId link — a member can only ever cancel their own schedule. Cancels at
 * Stripe first, then marks the local mirror (the subscription.deleted webhook
 * would too; doing it here makes the UI immediate).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ publicAppId: string; subscriptionId: string }> },
) {
  const { publicAppId, subscriptionId } = await params;
  const resolved = await resolveAppRequest(req, publicAppId);
  if (!resolved) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!resolved.member) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const orgId = resolved.app.organizationId;

  try {
    const json = (await req.json().catch(() => ({}))) as { action?: unknown };
    if (json.action !== "cancel") return NextResponse.json({ error: "unknown_action" }, { status: 400 });

    const gift = await onlineGivingService.getRecurringGiftForPerson(orgId, resolved.member.personId, subscriptionId);
    if (!gift) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (!gift.canceledAt) {
      const config = await onlineGivingService.getConfig(orgId);
      if (config?.stripeSecretKey) await cancelStripeSubscription(config.stripeSecretKey, subscriptionId);
      await onlineGivingService.markRecurringGiftCanceled(orgId, subscriptionId);
    }
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: "invalid", message: err instanceof Error ? err.message : "Could not cancel" },
      { status: 400 },
    );
  }
}
