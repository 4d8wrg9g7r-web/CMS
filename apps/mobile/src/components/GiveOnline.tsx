import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { cancelRecurringGift, fetchMyGiving, startGiveCheckout } from "../api";
import type { AppGiving, GiftInterval, MyGiving } from "../contract";

/**
 * Native give flow, amount-first like the big church-app platforms: large
 * amount, quick presets, frequency (one-time / weekly / every 2 weeks /
 * monthly), fund, cover-the-fees — then Stripe Checkout in the in-app browser.
 * Signed-in members also see their giving history and can cancel recurring
 * gifts right here.
 */

const PRESETS_CENTS = [2500, 5000, 10000, 25000];

// Client-safe mirror of giving/stripe.ts fee math — keep in sync.
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

const FREQUENCIES: { value: GiftInterval | null; label: string }[] = [
  { value: null, label: "One time" },
  { value: "week", label: "Weekly" },
  { value: "2week", label: "Every 2 wks" },
  { value: "month", label: "Monthly" },
];

const INTERVAL_LABEL: Record<string, string> = { week: "weekly", "2week": "every 2 weeks", month: "monthly" };

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;

export function GiveOnline({
  publicAppId,
  giving,
  token,
  accent,
}: {
  publicAppId: string;
  giving: AppGiving;
  token: string | null;
  accent: string;
}) {
  const [amountText, setAmountText] = useState("50");
  const [fundId, setFundId] = useState(giving.funds[0]?.id ?? "");
  const [interval, setInterval] = useState<GiftInterval | null>(null);
  const [coverFees, setCoverFees] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "bank">("card");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<MyGiving | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const loadMine = useCallback(async () => {
    if (!token) return;
    try {
      setMine(await fetchMyGiving(publicAppId, token));
    } catch {
      // Non-fatal: the give flow works without history.
    }
  }, [publicAppId, token]);

  useEffect(() => {
    void loadMine();
  }, [loadMine]);

  const parsed = Number.parseFloat(amountText.replace(/[^0-9.]/g, ""));
  const amountCents = Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
  const valid = amountCents >= 100;
  const chargeCents = coverFees && valid ? grossUp(amountCents, paymentMethod) : amountCents;
  const feeCents = valid ? grossUp(amountCents, paymentMethod) - amountCents : 0;

  const give = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const url = await startGiveCheckout(publicAppId, token, { amountCents, fundId, interval, coverFees, paymentMethod });
      await WebBrowser.openBrowserAsync(url);
      await loadMine();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout");
    }
    setBusy(false);
  };

  const cancel = async (subscriptionId: string) => {
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    try {
      await cancelRecurringGift(publicAppId, token, subscriptionId);
      await loadMine();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel");
    }
    setConfirming(null);
    setBusy(false);
  };

  return (
    <View style={styles.column}>
      <View style={styles.panel}>
        <View style={styles.amountRow}>
          <Text style={[styles.amountDollar, { color: accent }]}>$</Text>
          <TextInput
            value={amountText}
            onChangeText={(v) => setAmountText(v.replace(/[^0-9.]/g, ""))}
            keyboardType="decimal-pad"
            style={styles.amountInput}
          />
        </View>

        <View style={styles.presetRow}>
          {PRESETS_CENTS.map((cents) => {
            const selected = amountCents === cents;
            return (
              <Pressable key={cents} onPress={() => setAmountText(String(cents / 100))} style={[styles.preset, selected && { borderColor: accent }]}>
                <Text style={[styles.presetText, selected && { color: accent }]}>${cents / 100}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.freqTrack}>
          {FREQUENCIES.map(({ value, label }) => {
            const selected = interval === value;
            return (
              <Pressable
                key={label}
                onPress={() => setInterval(value)}
                style={[styles.freqPill, selected && { backgroundColor: accent }]}
              >
                <Text style={[styles.freqPillText, selected && styles.freqPillTextOn]} numberOfLines={1}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {giving.bank === true && (
          <View style={styles.freqTrack}>
            {(
              [
                { value: "card", label: "\uD83D\uDCB3 Card" },
                { value: "bank", label: "\uD83C\uDFE6 Bank (lower fees)" },
              ] as { value: "card" | "bank"; label: string }[]
            ).map(({ value, label }) => {
              const selected = paymentMethod === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => setPaymentMethod(value)}
                  style={[styles.freqPill, selected && { backgroundColor: accent }]}
                >
                  <Text style={[styles.freqPillText, selected && styles.freqPillTextOn]} numberOfLines={1}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {giving.funds.length > 1 && (
          <View style={styles.fundRow}>
            {giving.funds.map((fund) => {
              const selected = fundId === fund.id;
              return (
                <Pressable key={fund.id} onPress={() => setFundId(fund.id)} style={[styles.fundChip, selected && { borderColor: accent }]}>
                  <Text style={[styles.fundChipText, selected && { color: accent, fontWeight: "700" }]}>{fund.name}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={styles.coverRow}>
          <Switch value={coverFees} onValueChange={setCoverFees} />
          <Text style={styles.coverText}>
            Cover processing costs{valid ? ` (+${money(feeCents)})` : ""} so 100% reaches the church
          </Text>
        </View>

        <Pressable
          onPress={() => void give()}
          disabled={!valid || busy}
          style={[styles.giveButton, { backgroundColor: accent, opacity: !valid || busy ? 0.5 : 1 }]}
        >
          <Text style={styles.giveButtonText}>
            {busy
              ? "Opening secure checkout…"
              : valid
                ? `❤️ Give ${money(chargeCents)}${interval ? ` ${INTERVAL_LABEL[interval]}` : ""}`
                : "❤️ Give"}
          </Text>
        </Pressable>
        {error && <Text style={styles.error}>{error}</Text>}
        <Text style={styles.secureNote}>🔒 Secure checkout by Stripe — we never see your card.</Text>
      </View>

      {mine && mine.recurring.length > 0 && (
        <View style={styles.panel}>
          <Text style={styles.sectionLabel}>RECURRING GIFTS</Text>
          {mine.recurring.map((gift) => (
            <View key={gift.subscription_id} style={styles.mineRow}>
              <Text style={styles.mineText}>
                🔁 <Text style={styles.mineAmount}>{money(gift.amount_cents)}</Text>{" "}
                {INTERVAL_LABEL[gift.interval] ?? gift.interval}
                {gift.fund_name ? ` · ${gift.fund_name}` : ""}
              </Text>
              {confirming === gift.subscription_id ? (
                <View style={styles.confirmRow}>
                  <Pressable disabled={busy} onPress={() => void cancel(gift.subscription_id)} hitSlop={6}>
                    <Text style={styles.confirmYes}>{busy ? "…" : "Yes, cancel"}</Text>
                  </Pressable>
                  <Pressable onPress={() => setConfirming(null)} hitSlop={6}>
                    <Text style={styles.confirmKeep}>Keep</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable onPress={() => setConfirming(gift.subscription_id)} hitSlop={6}>
                  <Text style={styles.cancelLink}>Cancel</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      )}

      {mine && mine.history.length > 0 && (
        <View style={styles.panel}>
          <Text style={styles.sectionLabel}>MY GIVING</Text>
          {mine.history.map((gift) => (
            <View key={gift.id} style={styles.mineRow}>
              <Text style={styles.mineText}>
                {gift.fund_name}
                <Text style={styles.mineDate}>
                  {"  "}
                  {new Date(gift.received_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </Text>
              </Text>
              <Text style={styles.mineAmount}>{money(gift.amount_cents)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: 12 },
  panel: { backgroundColor: "#ffffff", borderRadius: 12, borderWidth: 1, borderColor: "#e5e5e5", padding: 14, gap: 12 },
  amountRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center", paddingTop: 4 },
  amountDollar: { fontSize: 24, fontWeight: "800", paddingBottom: 8 },
  amountInput: { fontSize: 46, fontWeight: "800", color: "#171717", minWidth: 120, textAlign: "center", padding: 0 },
  presetRow: { flexDirection: "row", gap: 8 },
  preset: { flex: 1, borderWidth: 1, borderColor: "#e5e5e5", borderRadius: 10, paddingVertical: 9, alignItems: "center" },
  presetText: { fontSize: 14, fontWeight: "800", color: "#525252" },
  freqTrack: { flexDirection: "row", backgroundColor: "#f0f0ef", borderRadius: 18, padding: 3, gap: 2 },
  freqPill: { flex: 1, borderRadius: 15, paddingVertical: 7, alignItems: "center" },
  freqPillText: { fontSize: 10.5, fontWeight: "700", color: "#525252" },
  freqPillTextOn: { color: "#ffffff" },
  fundRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  fundChip: { borderWidth: 1, borderColor: "#e5e5e5", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 },
  fundChipText: { fontSize: 12, color: "#525252" },
  coverRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  coverText: { flex: 1, fontSize: 12, color: "#525252", lineHeight: 16 },
  giveButton: { borderRadius: 22, paddingVertical: 13, alignItems: "center" },
  giveButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  error: { color: "#b91c1c", fontSize: 12, textAlign: "center" },
  secureNote: { fontSize: 11, color: "#a3a3a3", textAlign: "center" },
  sectionLabel: { fontSize: 11, fontWeight: "800", color: "#a3a3a3", letterSpacing: 0.8 },
  mineRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  mineText: { flex: 1, fontSize: 13, color: "#262626" },
  mineDate: { fontSize: 11, color: "#a3a3a3" },
  mineAmount: { fontSize: 13, fontWeight: "700", color: "#171717" },
  cancelLink: { fontSize: 12, color: "#a3a3a3" },
  confirmRow: { flexDirection: "row", gap: 10 },
  confirmYes: { fontSize: 12, fontWeight: "700", color: "#b91c1c" },
  confirmKeep: { fontSize: 12, color: "#a3a3a3" },
});
