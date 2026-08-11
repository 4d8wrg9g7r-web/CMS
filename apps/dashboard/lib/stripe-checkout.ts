import { GIFT_INTERVALS, stripeFormEncode, type GiftInterval } from "@cms/database";

/**
 * Stripe Checkout over plain REST (ADR-015 — no SDK; the API is form-encoded
 * HTTPS). Runs with the CHURCH's OWN secret key from OnlineGivingConfig, so
 * funds settle directly to the church's Stripe account; the platform never
 * holds money. Server-side only — keys must never reach a client bundle.
 */

const STRIPE_API = "https://api.stripe.com/v1";

async function stripePost<T>(secretKey: string, path: string, params: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secretKey}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: stripeFormEncode(params),
  });
  const json = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!res.ok || !json) {
    throw new Error(json?.error?.message ?? `Stripe request failed (${res.status})`);
  }
  return json;
}

async function stripeGet<T>(secretKey: string, path: string): Promise<T> {
  const res = await fetch(`${STRIPE_API}${path}`, { headers: { authorization: `Bearer ${secretKey}` } });
  const json = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!res.ok || !json) {
    throw new Error(json?.error?.message ?? `Stripe request failed (${res.status})`);
  }
  return json;
}

export interface GiveCheckoutInput {
  /** The amount to charge (already grossed-up if the donor covers fees). */
  amountCents: number;
  currency: string;
  fundId: string;
  fundName: string;
  /** null = one-time; otherwise a GIFT_INTERVALS key (week / 2week / month). */
  interval: GiftInterval | null;
  personId: string | null;
  successUrl: string;
  cancelUrl: string;
}

export async function createGiveCheckoutSession(
  secretKey: string,
  input: GiveCheckoutInput,
): Promise<{ id: string; url: string }> {
  const metadata = {
    fund_id: input.fundId,
    ...(input.personId ? { person_id: input.personId } : {}),
    ...(input.interval ? { gift_interval: input.interval } : {}),
  };
  const recurring = input.interval ? GIFT_INTERVALS[input.interval] : null;
  const session = await stripePost<{ id: string; url: string | null }>(secretKey, "/checkout/sessions", {
    mode: recurring ? "subscription" : "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: input.currency,
          unit_amount: input.amountCents,
          product_data: { name: `Gift — ${input.fundName}` },
          ...(recurring ? { recurring: { interval: recurring.interval, interval_count: recurring.intervalCount } } : {}),
        },
      },
    ],
    // Session metadata covers one-time gifts (checkout.session.completed);
    // subscription metadata rides every renewal's invoice.
    metadata,
    ...(recurring ? { subscription_data: { metadata } } : {}),
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return { id: session.id, url: session.url };
}

/** Cancel a recurring gift at Stripe (immediate). */
export async function cancelStripeSubscription(secretKey: string, subscriptionId: string): Promise<void> {
  const res = await fetch(`${STRIPE_API}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${secretKey}` },
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(json?.error?.message ?? `Stripe cancel failed (${res.status})`);
  }
}

/** Renewal invoices don't carry metadata directly — read it off the subscription. */
export async function fetchSubscriptionMetadata(
  secretKey: string,
  subscriptionId: string,
): Promise<Record<string, string>> {
  const sub = await stripeGet<{ metadata?: Record<string, string> }>(
    secretKey,
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
  );
  return sub.metadata ?? {};
}
