import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { requestCode, verifyCode } from "../auth";

/**
 * Two-step member sign-in (email → 6-digit emailed code), mirroring the web
 * flow: identical responses whether or not the email matched — no enumeration.
 */
export function SignInScreen({
  publicAppId,
  appName,
  accent,
  onSignedIn,
  onCancel,
}: {
  publicAppId: string;
  appName: string;
  accent: string;
  onSignedIn: () => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (step === "email") {
        if (!email.trim()) throw new Error("Enter your email address.");
        await requestCode(publicAppId, email.trim());
        setStep("code");
      } else {
        await verifyCode(publicAppId, email.trim(), code.trim());
        onSignedIn();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
    setBusy(false);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>{appName}</Text>
        <Text style={styles.subtitle}>Sign in to your church family</Text>

        {step === "email" ? (
          <>
            <Text style={styles.label}>Your email address</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor="#a3a3a3"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={styles.input}
              autoFocus
            />
            <Text style={styles.hint}>Use the email your church has on file — we&apos;ll send you a 6-digit code.</Text>
          </>
        ) : (
          <>
            <Text style={styles.hint}>
              If <Text style={styles.bold}>{email.trim()}</Text> is in our directory, a 6-digit code is on its way.
            </Text>
            <Text style={styles.label}>Enter the code</Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              placeholderTextColor="#a3a3a3"
              keyboardType="number-pad"
              maxLength={6}
              style={[styles.input, styles.codeInput]}
              autoFocus
            />
          </>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable onPress={() => void submit()} disabled={busy} style={[styles.button, { backgroundColor: accent }]}>
          {busy ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>{step === "email" ? "Send me a code" : "Sign in"}</Text>
          )}
        </Pressable>
        <Pressable onPress={onCancel} hitSlop={8}>
          <Text style={styles.cancel}>Not now</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f4", justifyContent: "center", padding: 20 },
  card: { backgroundColor: "#ffffff", borderRadius: 20, borderWidth: 1, borderColor: "#e5e5e5", padding: 22, gap: 10 },
  title: { fontSize: 22, fontWeight: "800", color: "#171717" },
  subtitle: { fontSize: 14, color: "#737373", marginBottom: 6 },
  label: { fontSize: 13, fontWeight: "600", color: "#404040", marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#d4d4d4",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#171717",
  },
  codeInput: { textAlign: "center", fontSize: 22, fontWeight: "700", letterSpacing: 10 },
  hint: { fontSize: 13, color: "#737373", lineHeight: 18 },
  bold: { fontWeight: "700", color: "#404040" },
  error: { color: "#b91c1c", fontSize: 13 },
  button: { borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 6 },
  buttonText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  cancel: { textAlign: "center", color: "#737373", fontSize: 13, paddingVertical: 8 },
});
