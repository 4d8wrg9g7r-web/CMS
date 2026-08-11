"use client";

import { useState, useTransition } from "react";
import { Repeat } from "lucide-react";
import { useRouter } from "next/navigation";
import { cancelRecurringGiftAction } from "../../app/a/[publicAppId]/give/actions";

/**
 * A member's own giving, right on the Give tab: recent gifts (every method —
 * Sunday checks included) and active recurring schedules with cancel. Data is
 * server-rendered from their session; nothing here is another member's.
 */

export interface MyGiftRow {
  id: string;
  amountCents: number;
  fundName: string;
  method: string;
  receivedAt: string;
}

export interface MyRecurringRow {
  subscriptionId: string;
  amountCents: number;
  interval: string;
  fundName: string | null;
}

const INTERVAL_LABEL: Record<string, string> = { week: "weekly", "2week": "every 2 weeks", month: "monthly" };
const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

export function MyGivingPanel({
  publicAppId,
  history,
  recurring,
  accent,
}: {
  publicAppId: string;
  history: MyGiftRow[];
  recurring: MyRecurringRow[];
  accent: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  if (history.length === 0 && recurring.length === 0) return null;

  const cancel = (subscriptionId: string) => {
    startTransition(async () => {
      const result = await cancelRecurringGiftAction(publicAppId, subscriptionId);
      if (!result.ok) setError(result.error ?? "Could not cancel");
      setConfirming(null);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3" data-section="my-giving">
      {recurring.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">Recurring gifts</p>
          <ul className="flex flex-col gap-2">
            {recurring.map((gift) => (
              <li key={gift.subscriptionId} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm text-neutral-800">
                  <Repeat size={14} style={{ color: accent }} />
                  <span className="font-semibold">{money(gift.amountCents)}</span>
                  {INTERVAL_LABEL[gift.interval] ?? gift.interval}
                  {gift.fundName && <span className="text-neutral-400">· {gift.fundName}</span>}
                </span>
                {confirming === gift.subscriptionId ? (
                  <span className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => cancel(gift.subscriptionId)}
                      className="font-semibold text-red-600"
                    >
                      {pending ? "Canceling…" : "Yes, cancel"}
                    </button>
                    <button type="button" onClick={() => setConfirming(null)} className="text-neutral-400">
                      Keep
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(gift.subscriptionId)}
                    className="text-xs text-neutral-400 hover:text-neutral-600"
                  >
                    Cancel
                  </button>
                )}
              </li>
            ))}
          </ul>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      )}

      {history.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">My giving</p>
          <ul className="divide-y divide-neutral-100">
            {history.map((gift) => (
              <li key={gift.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="text-neutral-800">
                  {gift.fundName}
                  <span className="ml-1.5 text-xs text-neutral-400">
                    {new Date(gift.receivedAt).toLocaleDateString("en-US", {
                      timeZone: "UTC",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </span>
                <span className="font-semibold text-neutral-900">{money(gift.amountCents)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
