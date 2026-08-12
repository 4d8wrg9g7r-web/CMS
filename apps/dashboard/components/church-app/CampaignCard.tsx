"use client";

import { useState, useTransition } from "react";
import { Target } from "lucide-react";
import { useRouter } from "next/navigation";
import { pledgeAction } from "../../app/a/[publicAppId]/give/actions";

/**
 * A pledge-campaign card on the Give tab (docs/domain/giving.md "Pledge
 * campaigns"): thermometer toward the goal, pledge totals, and — for signed-in
 * members — their own pledge + fulfillment and a pledge form.
 */

export interface AppCampaignView {
  id: string;
  name: string;
  description: string | null;
  fundName: string;
  goalCents: number;
  raisedCents: number;
  pledgedCents: number;
  pledgeCount: number;
  endsAt: string | null;
  myPledgeCents: number | null;
  myGivenCents: number;
}

const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;
const percent = (raised: number, goal: number) =>
  goal <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((raised / goal) * 100)));

export function CampaignCard({
  publicAppId,
  campaign,
  accent,
  signedIn,
}: {
  publicAppId: string;
  campaign: AppCampaignView;
  accent: string;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [pledging, setPledging] = useState(false);
  const [amountText, setAmountText] = useState(
    campaign.myPledgeCents ? String(Math.round(campaign.myPledgeCents / 100)) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const pct = percent(campaign.raisedCents, campaign.goalCents);
  const amountCents = Math.round(Number.parseFloat(amountText.replace(/[^0-9.]/g, "") || "0") * 100);
  const valid = amountCents >= 100;

  const submit = () => {
    if (!valid || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await pledgeAction(publicAppId, campaign.id, amountCents);
      if (!result.ok) {
        setError(result.error ?? "Could not save your pledge");
        return;
      }
      setPledging(false);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4" data-campaign={campaign.id}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 font-bold text-neutral-900">
            <Target size={15} style={{ color: accent }} /> {campaign.name}
          </p>
          {campaign.description && <p className="mt-0.5 text-xs text-neutral-500">{campaign.description}</p>}
        </div>
        {campaign.endsAt && (
          <span className="shrink-0 text-[11px] text-neutral-400">
            ends {new Date(campaign.endsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        )}
      </div>

      <div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-neutral-100">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: accent }} />
        </div>
        <div className="mt-1.5 flex items-baseline justify-between text-xs">
          <span className="font-bold text-neutral-900">
            {money(campaign.raisedCents)} <span className="font-normal text-neutral-400">raised</span>
          </span>
          <span className="text-neutral-400">
            {pct}% of {money(campaign.goalCents)}
          </span>
        </div>
        {campaign.pledgeCount > 0 && (
          <p className="mt-0.5 text-[11px] text-neutral-400">
            {money(campaign.pledgedCents)} pledged by {campaign.pledgeCount}{" "}
            {campaign.pledgeCount === 1 ? "family" : "families"}
          </p>
        )}
      </div>

      {signedIn &&
        (campaign.myPledgeCents !== null && !pledging ? (
          <div className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2 text-xs">
            <span className="text-neutral-700">
              Your pledge: <span className="font-bold">{money(campaign.myPledgeCents)}</span>
              {" · "}given {money(campaign.myGivenCents)} (
              {percent(campaign.myGivenCents, campaign.myPledgeCents)}%)
            </span>
            <button type="button" onClick={() => setPledging(true)} className="font-semibold" style={{ color: accent }}>
              Change
            </button>
          </div>
        ) : pledging || campaign.myPledgeCents === null ? (
          <div className="flex flex-col gap-2">
            {!pledging ? (
              <button
                type="button"
                onClick={() => setPledging(true)}
                className="w-full rounded-full border py-2 text-sm font-semibold"
                style={{ borderColor: accent, color: accent }}
              >
                Make a pledge
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex flex-1 items-center gap-1 rounded-lg border border-neutral-200 px-3 py-2">
                  <span className="text-sm font-semibold text-neutral-400">$</span>
                  <input
                    value={amountText}
                    onChange={(e) => setAmountText(e.target.value.replace(/[^0-9.]/g, ""))}
                    inputMode="decimal"
                    placeholder="1,000"
                    aria-label="Pledge amount in dollars"
                    className="w-full text-sm font-semibold text-neutral-900 outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!valid || pending}
                  className="rounded-full px-5 py-2 text-sm font-semibold text-white"
                  style={{ backgroundColor: accent, opacity: !valid || pending ? 0.5 : 1 }}
                >
                  {pending ? "Saving…" : "Pledge"}
                </button>
              </div>
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        ) : null)}
    </div>
  );
}
