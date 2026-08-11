"use client";

import { useMemo, useRef, useState } from "react";
import { Heart, Lock } from "lucide-react";
import { giveCheckoutAction } from "../../app/a/[publicAppId]/give/actions";

/**
 * The give flow (docs/domain/giving.md "Online giving"), amount-first like the
 * big church-app platforms: a large tappable amount, quick presets, frequency
 * (one-time / weekly / every 2 weeks / monthly), fund, and a cover-the-fees
 * option — then straight into Stripe Checkout (no card form on our page).
 */

const PRESETS_CENTS = [2500, 5000, 10000, 25000];

// Client-safe mirror of giving/stripe.ts fee math (that module pulls in
// node:crypto and must not enter the browser bundle). Keep in sync.
const FEE_PERCENT = 0.029;
const FEE_FIXED_CENTS = 30;
const ACH_FEE_PERCENT = 0.008;
const ACH_FEE_CAP_CENTS = 500;
const grossUp = (net: number, method: "card" | "bank") => {
  if (method === "bank") {
    const uncapped = Math.ceil(net / (1 - ACH_FEE_PERCENT));
    return uncapped - net >= ACH_FEE_CAP_CENTS ? net + ACH_FEE_CAP_CENTS : uncapped;
  }
  return Math.ceil((net + FEE_FIXED_CENTS) / (1 - FEE_PERCENT));
};

const FREQUENCIES = [
  { value: null, label: "One time" },
  { value: "week" as const, label: "Weekly" },
  { value: "2week" as const, label: "Every 2 wks" },
  { value: "month" as const, label: "Monthly" },
];

const money = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 });

export function GiveOnlinePanel({
  publicAppId,
  funds,
  accent,
  bankEnabled = false,
}: {
  publicAppId: string;
  funds: { id: string; name: string }[];
  accent: string;
  bankEnabled?: boolean;
}) {
  const [amountText, setAmountText] = useState("50");
  const [fundId, setFundId] = useState(funds[0]?.id ?? "");
  const [interval, setInterval] = useState<"week" | "2week" | "month" | null>(null);
  const [coverFees, setCoverFees] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "bank">("card");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const amountCents = useMemo(() => {
    const parsed = Number.parseFloat(amountText.replace(/[^0-9.]/g, ""));
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
  }, [amountText]);
  const valid = amountCents >= 100;
  const chargeCents = coverFees && valid ? grossUp(amountCents, paymentMethod) : amountCents;
  const feeCents = valid ? grossUp(amountCents, paymentMethod) - amountCents : 0;
  const frequencyLabel = FREQUENCIES.find((f) => f.value === interval)?.label ?? "";

  const give = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const result = await giveCheckoutAction(publicAppId, { amountCents, fundId, interval, coverFees, paymentMethod });
    if (result.url) {
      window.location.href = result.url;
      return;
    }
    setError(result.error ?? "Could not start checkout");
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-5">
      {/* Amount-first: the big number IS the interface. */}
      <button
        type="button"
        onClick={() => amountRef.current?.focus()}
        className="flex items-end justify-center gap-1 pt-2"
      >
        <span className="pb-1.5 text-2xl font-bold" style={{ color: accent }}>
          $
        </span>
        <input
          ref={amountRef}
          value={amountText}
          onChange={(e) => setAmountText(e.target.value.replace(/[^0-9.]/g, ""))}
          inputMode="decimal"
          aria-label="Gift amount in dollars"
          className="w-40 border-none bg-transparent text-center text-5xl font-extrabold tracking-tight text-neutral-900 outline-none"
        />
      </button>

      <div className="grid grid-cols-4 gap-2">
        {PRESETS_CENTS.map((cents) => {
          const selected = amountCents === cents;
          return (
            <button
              key={cents}
              type="button"
              onClick={() => setAmountText(String(cents / 100))}
              className="rounded-lg border py-2 text-sm font-bold"
              style={selected ? { borderColor: accent, color: accent } : { borderColor: "#e5e5e5", color: "#525252" }}
            >
              ${cents / 100}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-4 gap-1 rounded-full bg-neutral-100 p-1" role="radiogroup" aria-label="Frequency">
        {FREQUENCIES.map(({ value, label }) => {
          const selected = interval === value;
          return (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setInterval(value)}
              className="rounded-full py-1.5 text-[11px] font-semibold"
              style={selected ? { backgroundColor: accent, color: "#ffffff" } : { color: "#525252" }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {bankEnabled && (
        <div className="grid grid-cols-2 gap-1 rounded-full bg-neutral-100 p-1" role="radiogroup" aria-label="Payment method">
          {(
            [
              { value: "card" as const, label: "\uD83D\uDCB3 Card" },
              { value: "bank" as const, label: "\uD83C\uDFE6 Bank (lower fees)" },
            ] as const
          ).map(({ value, label }) => {
            const selected = paymentMethod === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setPaymentMethod(value)}
                className="rounded-full py-1.5 text-[11px] font-semibold"
                style={selected ? { backgroundColor: accent, color: "#ffffff" } : { color: "#525252" }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

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

      <label className="flex items-center gap-2 text-xs text-neutral-600">
        <input type="checkbox" checked={coverFees} onChange={(e) => setCoverFees(e.target.checked)} className="h-4 w-4" />
        Cover processing costs{valid ? ` (+$${money(feeCents)})` : ""} so 100% reaches the church
      </label>

      <button
        type="button"
        onClick={() => void give()}
        disabled={!valid || busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-[15px] font-bold text-white"
        style={{ backgroundColor: accent, opacity: !valid || busy ? 0.5 : 1 }}
      >
        <Heart size={16} />
        {busy
          ? "Opening secure checkout…"
          : valid
            ? `Give $${money(chargeCents)}${interval ? ` ${frequencyLabel.toLowerCase()}` : ""}`
            : "Give"}
      </button>
      {error && <p className="text-center text-xs text-red-600">{error}</p>}
      {paymentMethod === "bank" && (
        <p className="text-center text-[11px] text-neutral-400">
          Bank gifts take a few business days to settle before they appear in your history.
        </p>
      )}
      <p className="flex items-center justify-center gap-1 text-[11px] text-neutral-400">
        <Lock size={11} /> Secure checkout by Stripe — we never see your card.
      </p>
    </div>
  );
}
