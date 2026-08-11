import {
  appService,
  matchFundByKeyword,
  onlineGivingService,
  parseTextGift,
  twimlReply,
  verifyTwilioSignature,
} from "@cms/database";
import { NextResponse } from "next/server";
import { createGiveCheckoutSession } from "../../../../../lib/stripe-checkout";

export const runtime = "nodejs";

/**
 * Text-to-give inbound webhook (ADR-016): the church points its Twilio
 * number's incoming-SMS webhook here. Twilio POSTs form-encoded {From, Body,
 * …} signed with the church's auth token; we answer with TwiML — a prefilled
 * Stripe Checkout link — so the whole loop needs no outbound SMS API.
 *
 * "50"            → $50 to the default fund
 * "50 missions"   → $50 to the fund matching "missions"
 * anything else   → help text
 *
 * The sender's phone is matched against People so the eventual webhook-recorded
 * gift lands on their record (personId metadata), same as an in-app gift.
 */

const xml = (body: string) => new Response(body, { status: 200, headers: { "content-type": "text/xml" } });

export async function POST(req: Request, { params }: { params: Promise<{ publicAppId: string }> }) {
  const { publicAppId } = await params;
  const app = await appService.resolvePublicApp(publicAppId);
  if (!app) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const orgId = app.organizationId;

  const config = await onlineGivingService.getConfig(orgId);
  if (!config?.textGivingEnabled || !config.twilioAuthToken || !onlineGivingService.isLive(config)) {
    return NextResponse.json({ error: "not_configured" }, { status: 400 });
  }

  // Twilio signs the exact public URL it POSTed to — rebuild it behind proxies.
  const requestUrl = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? requestUrl.host;
  const proto = req.headers.get("x-forwarded-proto") ?? requestUrl.protocol.replace(":", "");
  const publicUrl = `${proto}://${host}${requestUrl.pathname}${requestUrl.search}`;

  const form = await req.formData();
  const bodyParams: Record<string, string> = {};
  form.forEach((value, key) => {
    if (typeof value === "string") bodyParams[key] = value;
  });

  const signature = req.headers.get("x-twilio-signature") ?? "";
  if (!verifyTwilioSignature(publicUrl, bodyParams, signature, config.twilioAuthToken)) {
    return NextResponse.json({ error: "bad_signature" }, { status: 403 });
  }

  const parsed = parseTextGift(bodyParams.Body ?? "");
  if (!parsed.ok) return xml(twimlReply(parsed.reply));

  try {
    const funds = await onlineGivingService.listOnlineFunds(orgId);
    const fund = matchFundByKeyword(funds, parsed.gift.fundKeyword);
    if (!fund) return xml(twimlReply("Online giving isn't quite set up yet — please check back soon."));

    const person = await onlineGivingService.findPersonByPhone(orgId, bodyParams.From ?? "");
    const session = await createGiveCheckoutSession(config.stripeSecretKey!, {
      amountCents: parsed.gift.amountCents,
      currency: config.currency,
      fundId: fund.id,
      fundName: fund.name,
      interval: null,
      paymentMethod: "card",
      personId: person?.id ?? null,
      successUrl: `https://${host}/a/${encodeURIComponent(publicAppId)}/give/thanks`,
      cancelUrl: `https://${host}/a/${encodeURIComponent(publicAppId)}`,
    });

    const dollars = (parsed.gift.amountCents / 100).toLocaleString("en-US");
    return xml(twimlReply(`Tap to give $${dollars} to ${fund.name} — ${app.organizationName}: ${session.url}`));
  } catch (err) {
    console.error("Text-to-give checkout failed:", err);
    return xml(twimlReply("Something went wrong on our end — please try again in a few minutes."));
  }
}
