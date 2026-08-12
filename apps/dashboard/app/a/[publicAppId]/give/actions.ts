"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import {
  appMemberService,
  appService,
  giftAmountError,
  grossUpCentsForMethod,
  onlineGivingService,
  type GiftInterval,
  type GivePaymentMethod,
} from "@cms/database";
import { cancelStripeSubscription, createGiveCheckoutSession } from "../../../../lib/stripe-checkout";

/**
 * PWA checkout starter (cookie-session variant of the give/checkout API).
 * Guests can give; a signed-in member's personId rides along as metadata so
 * the webhook links the gift to their record.
 */
export async function giveCheckoutAction(
  publicAppId: string,
  input: {
    amountCents: number;
    fundId: string;
    interval: GiftInterval | null;
    coverFees?: boolean;
    paymentMethod?: GivePaymentMethod;
  },
): Promise<{ url?: string; error?: string }> {
  try {
    const app = await appService.resolvePublicApp(publicAppId);
    if (!app) return { error: "This app is not available." };
    const orgId = app.organizationId;

    const config = await onlineGivingService.getConfig(orgId);
    if (!onlineGivingService.isLive(config)) return { error: "Online giving isn't set up." };

    const amountError = giftAmountError(input.amountCents);
    if (amountError) return { error: amountError };

    const funds = await onlineGivingService.listOnlineFunds(orgId);
    const fund = funds.find((f) => f.id === input.fundId) ?? funds[0];
    if (!fund) return { error: "No fund is open for online giving." };

    const token = (await cookies()).get(`app_session_${publicAppId}`)?.value ?? "";
    const member = token ? await appMemberService.getSessionMember(orgId, token) : null;

    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    const origin = `${proto}://${host}`;

    const paymentMethod: GivePaymentMethod = input.paymentMethod === "bank" && config!.achEnabled ? "bank" : "card";
    const session = await createGiveCheckoutSession(config!.stripeSecretKey!, {
      amountCents: input.coverFees ? grossUpCentsForMethod(input.amountCents, paymentMethod) : input.amountCents,
      paymentMethod,
      currency: config!.currency,
      fundId: fund.id,
      fundName: fund.name,
      interval: input.interval,
      personId: member?.personId ?? null,
      successUrl: `${origin}/a/${encodeURIComponent(publicAppId)}/give/thanks`,
      cancelUrl: `${origin}/a/${encodeURIComponent(publicAppId)}`,
    });
    return { url: session.url };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start checkout" };
  }
}

/** Cancel one of the signed-in member's recurring gifts (ownership enforced). */
export async function cancelRecurringGiftAction(
  publicAppId: string,
  subscriptionId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const app = await appService.resolvePublicApp(publicAppId);
    if (!app) return { ok: false, error: "This app is not available." };
    const orgId = app.organizationId;

    const token = (await cookies()).get(`app_session_${publicAppId}`)?.value ?? "";
    const member = token ? await appMemberService.getSessionMember(orgId, token) : null;
    if (!member) return { ok: false, error: "Sign in first." };

    const gift = await onlineGivingService.getRecurringGiftForPerson(orgId, member.personId, subscriptionId);
    if (!gift) return { ok: false, error: "That recurring gift wasn't found." };
    if (!gift.canceledAt) {
      const config = await onlineGivingService.getConfig(orgId);
      if (config?.stripeSecretKey) await cancelStripeSubscription(config.stripeSecretKey, subscriptionId);
      await onlineGivingService.markRecurringGiftCanceled(orgId, subscriptionId);
    }
    revalidatePath(`/a/${publicAppId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not cancel" };
  }
}

/** Make or update the signed-in member's pledge to a campaign. */
export async function pledgeAction(
  publicAppId: string,
  campaignId: string,
  amountCents: number,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const app = await appService.resolvePublicApp(publicAppId);
    if (!app) return { ok: false, error: "This app is not available." };

    const token = (await cookies()).get(`app_session_${publicAppId}`)?.value ?? "";
    const member = token ? await appMemberService.getSessionMember(app.organizationId, token) : null;
    if (!member) return { ok: false, error: "Sign in to make a pledge." };

    const { campaignService } = await import("@cms/database");
    await campaignService.upsertPledge(app.organizationId, campaignId, member.personId, amountCents);
    revalidatePath(`/a/${publicAppId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save your pledge" };
  }
}
