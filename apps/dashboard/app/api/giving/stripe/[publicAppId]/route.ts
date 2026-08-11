import { NextResponse } from "next/server";
import { appService, onlineGivingService, verifyStripeSignature } from "@cms/database";
import { fetchSubscriptionMetadata } from "../../../../../lib/stripe-checkout";

export const runtime = "nodejs";

/**
 * Stripe webhook for online giving (ADR-015), one endpoint per church app:
 * the church points its Stripe webhook at /api/giving/stripe/<publicAppId>
 * and we verify with THAT church's signing secret — a valid signature from
 * any other account's secret is rejected, so cross-tenant injection is
 * impossible by construction.
 *
 * Recorded events:
 *   - checkout.session.completed (mode=payment): one-time gifts, keyed by
 *     payment_intent. Subscription checkouts are skipped here — their first
 *     charge arrives as invoice.paid, so nothing double-records.
 *   - invoice.paid: recurring gifts (first charge + renewals), keyed by
 *     invoice id; fund/person metadata read from the subscription. Also
 *     upserts the RecurringGift mirror the app's "My giving" screen shows.
 *   - customer.subscription.deleted: marks the mirror canceled.
 * Everything else is acknowledged and ignored. Recording is idempotent, so
 * Stripe's retries and replays are safe.
 */

interface StripeEvent {
  id: string;
  type: string;
  created: number;
  data: { object: Record<string, unknown> };
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function POST(req: Request, { params }: { params: Promise<{ publicAppId: string }> }) {
  const { publicAppId } = await params;
  const app = await appService.resolvePublicApp(publicAppId);
  if (!app) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const orgId = app.organizationId;

  const config = await onlineGivingService.getConfig(orgId);
  if (!config?.stripeWebhookSecret) {
    return NextResponse.json({ error: "not_configured" }, { status: 400 });
  }

  const payload = await req.text();
  const signature = req.headers.get("stripe-signature") ?? "";
  if (!verifyStripeSignature(payload, signature, config.stripeWebhookSecret)) {
    return NextResponse.json({ error: "bad_signature" }, { status: 400 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch {
    return NextResponse.json({ error: "bad_payload" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (session.mode === "payment") {
        const externalId = str(session.payment_intent);
        const amountCents = num(session.amount_total);
        if (externalId && amountCents) {
          const metadata = (session.metadata ?? {}) as Record<string, string>;
          const customer = (session.customer_details ?? {}) as Record<string, unknown>;
          await onlineGivingService.recordOnlineContribution(orgId, {
            externalId,
            amountCents,
            fundId: metadata.fund_id ?? null,
            personId: metadata.person_id ?? null,
            email: str(customer.email),
            donorName: str(customer.name),
            receivedAt: new Date(event.created * 1000),
          });
        }
      }
    } else if (event.type === "invoice.paid") {
      const invoice = event.data.object;
      const externalId = str(invoice.id);
      const amountCents = num(invoice.amount_paid);
      if (externalId && amountCents) {
        // Metadata lives on the subscription; a fetch failure still records
        // the gift (fund falls back) — money is never dropped.
        const parent = (invoice.parent ?? {}) as { subscription_details?: { subscription?: unknown } };
        const subscriptionId = str(invoice.subscription) ?? str(parent.subscription_details?.subscription);
        let metadata: Record<string, string> = {};
        if (subscriptionId && config.stripeSecretKey) {
          try {
            metadata = await fetchSubscriptionMetadata(config.stripeSecretKey, subscriptionId);
          } catch (err) {
            console.error("Subscription metadata fetch failed (recording with fund fallback):", err);
          }
        }
        await onlineGivingService.recordOnlineContribution(orgId, {
          externalId,
          amountCents,
          fundId: metadata.fund_id ?? null,
          personId: metadata.person_id ?? null,
          email: str(invoice.customer_email),
          donorName: str(invoice.customer_name),
          receivedAt: new Date(event.created * 1000),
        });
        if (subscriptionId) {
          await onlineGivingService.upsertRecurringGift(orgId, {
            subscriptionId,
            personId: metadata.person_id ?? null,
            email: str(invoice.customer_email),
            fundId: metadata.fund_id ?? null,
            amountCents,
            interval: metadata.gift_interval ?? "month",
            lastPaymentAt: new Date(event.created * 1000),
          });
        }
      }
    } else if (event.type === "customer.subscription.deleted") {
      const subscriptionId = str(event.data.object.id);
      if (subscriptionId) await onlineGivingService.markRecurringGiftCanceled(orgId, subscriptionId);
    }
  } catch (err) {
    // 500 → Stripe retries with backoff; recording is idempotent.
    console.error("Giving webhook processing failed:", err);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
