"use client";

import { useState } from "react";
import { Heart, Lock } from "lucide-react";
import { giveCheckoutAction } from "../../app/a/[publicAppId]/give/actions";

/**
 * In-app giving (docs/domain/giving.md "Online giving"): amount presets +
 * custom, fund choice, one-time or monthly — then straight into Stripe
 * Checkout (the card form never lives on our page, so no PCI surface).
 */

const PRESETS_CENTS = [2500, 5000, 10000, 25000];

function centsLabel(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US")}`;
}

export function GiveOnlinePanel({
  publicAppId,
  funds,
  accent,
}: {
  publicAppId: string;
  funds: { id: string; name: string }[];
  accent: string;
}) {
  const [amountCents, setAmountCents] = useState<number | null>(5000);
  const [custom, setCustom] = useState("");
  const [fundId, setFundId] = useState(funds[0]?.id ?? "");
  const [interval, setInterval] = useState<"month" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveCents = amountCents ?? Math.round(Number.parseFloat(custom || "0") * 100);
  const valid = Number.isFinite(effectiveCents) && effectiveCents >= 100;

  const give = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const result = await giveCheckoutAction(publicAppId, { amountCents: effectiveCents, fundId, interval });
    if (result.url) {
      window.location.href = result.url;
      return; // keep the button disabled while the redirect happens
    }
    setError(result.error ?? "Could not start checkout");
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-4">
      <div className="grid grid-cols-4 gap-2">
        {PRESETS_CENTS.map((cents) => {
          const selected = amountCents === cents;
          return (
            <button
              key={cents}
              type="button"
              onClick={() => {
                setAmountCents(cents);
                setCustom("");
              }}
              className="rounded-lg border py-2.5 text-sm font-bold"
              style={selected ? { borderColor: accent, color: accent } : { borderColor: "#e5e5e5", color: "#525252" }}
            >
              {centsLabel(cents)}
            </button>
          );
        })}
      </div>
      <label className="text-xs font-medium text-neutral-500">
        Or another amount
        <div className="mt-1 flex items-center gap-1 rounded-lg border border-neutral-200 px-3 py-2">
          <span className="text-sm font-semibold text-neutral-400">$</span>
          <input
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value);
              setAmountCents(null);
            }}
            inputMode="decimal"
            placeholder="0.00"
            className="w-full text-sm font-semibold text-neutral-900 outline-none"
          />
        </div>
      </label>

      {funds.length > 1 && (
        <label className="text-xs font-medium text-neutral-500">
          Give to
          <select
            value={fundId}
            onChange={(e) => setFundId(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900"
          >
            {funds.map((fund) => (
              <option key={fund.id} value={fund.id}>
                {fund.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex gap-2">
        {(
          [
            { value: null, label: "One time" },
            { value: "month" as const, label: "Monthly" },
          ] as const
        ).map(({ value, label }) => {
          const selected = interval === value;
          return (
            <button
              key={label}
              type="button"
              onClick={() => setInterval(value)}
              className="flex-1 rounded-full border py-2 text-sm font-semibold"
              style={selected ? { borderColor: accent, color: accent } : { borderColor: "#e5e5e5", color: "#525252" }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => void give()}
        disabled={!valid || busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full py-3 font-semibold text-white"
        style={{ backgroundColor: accent, opacity: !valid || busy ? 0.5 : 1 }}
      >
        <Heart size={15} />
        {busy ? "Opening secure checkout…" : interval ? `Give ${valid ? centsLabel(effectiveCents) : ""} monthly` : `Give ${valid ? centsLabel(effectiveCents) : ""}`}
      </button>
      {error && <p className="text-center text-xs text-red-600">{error}</p>}
      <p className="flex items-center justify-center gap-1 text-[11px] text-neutral-400">
        <Lock size={11} /> Secure checkout by Stripe — we never see your card.
      </p>
    </div>
  );
}
