"use client";

import { useActionState } from "react";
import type { MaskedGivingConfig } from "@cms/database";
import { saveOnlineGivingConfigAction } from "../app/(dashboard)/giving/actions";
import { buttonClasses } from "./ui/Button";
import { Input, Select } from "./ui/Input";

/**
 * Stripe connection form (docs/domain/giving.md "Online giving"): keys are
 * write-only — the server only ever tells us whether one is stored (and its
 * last 4), never the key itself. Leaving a key field blank keeps what's saved.
 */
export function OnlineGivingSettings({ config }: { config: MaskedGivingConfig }) {
  const [state, formAction, pending] = useActionState(saveOnlineGivingConfigAction, { error: null, saved: false });

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="enabled" defaultChecked={config.enabled} className="h-4 w-4" />
        Accept gifts in the church app
      </label>

      <label className="flex items-start gap-2 text-sm text-ink">
        <input type="checkbox" name="achEnabled" defaultChecked={config.achEnabled} className="mt-0.5 h-4 w-4" />
        <span>
          Offer bank (ACH) giving
          <span className="block text-xs text-ink-muted">
            0.8% fee capped at $5 — enable ACH Direct Debit on your Stripe account first, or bank checkouts will
            fail. Bank gifts settle in a few business days and are recorded when they clear.
          </span>
        </span>
      </label>

      <label className="text-xs text-ink-secondary">
        Stripe secret key{" "}
        {config.hasSecretKey && <span className="text-ink-muted">(saved — ends in {config.secretKeyLast4})</span>}
        <Input
          name="stripeSecretKey"
          type="password"
          placeholder={config.hasSecretKey ? "Leave blank to keep the saved key" : "sk_live_…"}
          autoComplete="off"
          className="mt-1 block w-full text-sm"
        />
      </label>

      <label className="text-xs text-ink-secondary">
        Webhook signing secret{" "}
        {config.hasWebhookSecret && <span className="text-ink-muted">(saved)</span>}
        <Input
          name="stripeWebhookSecret"
          type="password"
          placeholder={config.hasWebhookSecret ? "Leave blank to keep the saved secret" : "whsec_…"}
          autoComplete="off"
          className="mt-1 block w-full text-sm"
        />
      </label>

      <label className="flex items-start gap-2 text-sm text-ink">
        <input type="checkbox" name="textGivingEnabled" defaultChecked={config.textGivingEnabled} className="mt-0.5 h-4 w-4" />
        <span>
          Text-to-give
          <span className="block text-xs text-ink-muted">
            Members text an amount (like &ldquo;50&rdquo; or &ldquo;50 Missions&rdquo;) to your Twilio number and get
            a giving link back. Point the number&apos;s incoming-message webhook at the URL below.
          </span>
        </span>
      </label>

      <label className="text-xs text-ink-secondary">
        Twilio auth token {config.hasTwilioToken && <span className="text-ink-muted">(saved)</span>}
        <Input
          name="twilioAuthToken"
          type="password"
          placeholder={config.hasTwilioToken ? "Leave blank to keep the saved token" : "From your Twilio console"}
          autoComplete="off"
          className="mt-1 block w-full text-sm"
        />
      </label>

      <label className="text-xs text-ink-secondary">
        Currency
        <Select name="currency" defaultValue={config.currency} className="mt-1 block w-40 text-sm">
          <option value="usd">USD ($)</option>
          <option value="cad">CAD ($)</option>
          <option value="gbp">GBP (£)</option>
          <option value="eur">EUR (€)</option>
          <option value="aud">AUD ($)</option>
        </Select>
      </label>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClasses("primary", "sm")}>
          {pending ? "Saving…" : "Save settings"}
        </button>
        {state.saved && !state.error && <span className="text-xs text-success">Saved.</span>}
        {state.error && <span className="text-xs text-danger">{state.error}</span>}
      </div>
    </form>
  );
}
