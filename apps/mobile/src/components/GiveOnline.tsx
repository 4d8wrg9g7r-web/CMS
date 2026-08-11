import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { startGiveCheckout } from "../api";
import type { AppGiving } from "../contract";

/**
 * Native in-app giving: presets + custom amount, fund choice, one-time or
 * monthly, then Stripe Checkout in the in-app browser (SFSafariViewController /
 * Custom Tabs) — the card form never renders in our views.
 */

const PRESETS_CENTS = [2500, 5000, 10000, 25000];
const centsLabel = (cents: number) => `$${(cents / 100).toLocaleString("en-US")}`;

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
  const [amountCents, setAmountCents] = useState<number | null>(5000);
  const [custom, setCustom] = useState("");
  const [fundId, setFundId] = useState(giving.funds[0]?.id ?? "");
  const [interval, setInterval] = useState<"month" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveCents = amountCents ?? Math.round(Number.parseFloat(custom || "0") * 100);
  const valid = Number.isFinite(effectiveCents) && effectiveCents >= 100;

  const give = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const url = await startGiveCheckout(publicAppId, token, { amountCents: effectiveCents, fundId, interval });
      await WebBrowser.openBrowserAsync(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout");
    }
    setBusy(false);
  };

  return (
    <View style={styles.panel}>
      <View style={styles.presetRow}>
        {PRESETS_CENTS.map((cents) => {
          const selected = amountCents === cents;
          return (
            <Pressable
              key={cents}
              onPress={() => {
                setAmountCents(cents);
                setCustom("");
              }}
              style={[styles.preset, selected && { borderColor: accent }]}
            >
              <Text style={[styles.presetText, selected && { color: accent }]}>{centsLabel(cents)}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.customRow}>
        <Text style={styles.customDollar}>$</Text>
        <TextInput
          value={custom}
          onChangeText={(v) => {
            setCustom(v);
            setAmountCents(null);
          }}
          placeholder="Another amount"
          placeholderTextColor="#a3a3a3"
          keyboardType="decimal-pad"
          style={styles.customInput}
        />
      </View>

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

      <View style={styles.intervalRow}>
        {(
          [
            { value: null, label: "One time" },
            { value: "month" as const, label: "Monthly" },
          ] as const
        ).map(({ value, label }) => {
          const selected = interval === value;
          return (
            <Pressable key={label} onPress={() => setInterval(value)} style={[styles.intervalChip, selected && { borderColor: accent }]}>
              <Text style={[styles.intervalChipText, selected && { color: accent, fontWeight: "700" }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={() => void give()}
        disabled={!valid || busy}
        style={[styles.giveButton, { backgroundColor: accent, opacity: !valid || busy ? 0.5 : 1 }]}
      >
        <Text style={styles.giveButtonText}>
          {busy ? "Opening secure checkout…" : `❤️ Give${valid ? ` ${centsLabel(effectiveCents)}` : ""}${interval ? " monthly" : ""}`}
        </Text>
      </Pressable>
      {error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.secureNote}>🔒 Secure checkout by Stripe — we never see your card.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: "#ffffff", borderRadius: 12, borderWidth: 1, borderColor: "#e5e5e5", padding: 14, gap: 12 },
  presetRow: { flexDirection: "row", gap: 8 },
  preset: { flex: 1, borderWidth: 1, borderColor: "#e5e5e5", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  presetText: { fontSize: 14, fontWeight: "800", color: "#525252" },
  customRow: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: "#e5e5e5", borderRadius: 10, paddingHorizontal: 12 },
  customDollar: { fontSize: 14, fontWeight: "700", color: "#a3a3a3" },
  customInput: { flex: 1, fontSize: 14, fontWeight: "600", color: "#171717", paddingVertical: 10 },
  fundRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  fundChip: { borderWidth: 1, borderColor: "#e5e5e5", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 },
  fundChipText: { fontSize: 12, color: "#525252" },
  intervalRow: { flexDirection: "row", gap: 8 },
  intervalChip: { flex: 1, borderWidth: 1, borderColor: "#e5e5e5", borderRadius: 18, paddingVertical: 8, alignItems: "center" },
  intervalChipText: { fontSize: 13, color: "#525252" },
  giveButton: { borderRadius: 22, paddingVertical: 13, alignItems: "center" },
  giveButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  error: { color: "#b91c1c", fontSize: 12, textAlign: "center" },
  secureNote: { fontSize: 11, color: "#a3a3a3", textAlign: "center" },
});
