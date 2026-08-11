import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { fetchDirectory } from "../api";
import type { DirectoryEntry } from "../contract";

/**
 * "Find your church" — the container app's front door (the same directory the
 * web /a page renders). Selecting a church hands its public app id to the root.
 */
export function DirectoryScreen({ onSelect }: { onSelect: (entry: DirectoryEntry) => void }) {
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<DirectoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const results = await fetchDirectory(query);
        if (!cancelled) {
          setEntries(results);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("Could not reach the directory. Check your connection.");
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <View style={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.heroIcon}>⛪</Text>
        <Text style={styles.title}>Find your church</Text>
        <Text style={styles.subtitle}>Search for your church and open its app.</Text>
      </View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Church name"
        placeholderTextColor="#a3a3a3"
        style={styles.search}
        autoCorrect={false}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      {entries === null ? (
        <ActivityIndicator style={styles.loader} />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.public_app_id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>{query ? `No churches match “${query}”.` : "No churches are listed yet."}</Text>}
          renderItem={({ item }) => (
            <Pressable onPress={() => onSelect(item)} style={styles.card}>
              {item.logo_url ? (
                <Image source={{ uri: item.logo_url }} style={styles.logo} />
              ) : (
                <View style={[styles.logo, { backgroundColor: item.theme_color, alignItems: "center", justifyContent: "center" }]}>
                  <Text style={styles.logoInitial}>{item.app_name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.cardText}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.app_name}
                </Text>
                <Text style={styles.cardSubtitle} numberOfLines={1}>
                  {item.organization_name}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f4", paddingHorizontal: 20 },
  hero: { alignItems: "center", marginTop: 24, marginBottom: 16 },
  heroIcon: { fontSize: 40 },
  title: { fontSize: 24, fontWeight: "800", color: "#171717", marginTop: 8 },
  subtitle: { fontSize: 14, color: "#525252", marginTop: 4 },
  search: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d4d4d4",
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontSize: 15,
    color: "#171717",
  },
  loader: { marginTop: 32 },
  list: { paddingVertical: 14, gap: 10 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 16,
    padding: 14,
  },
  logo: { width: 44, height: 44, borderRadius: 12 },
  logoInitial: { color: "#ffffff", fontSize: 18, fontWeight: "700" },
  cardText: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: "#171717" },
  cardSubtitle: { fontSize: 13, color: "#737373" },
  empty: { textAlign: "center", color: "#737373", paddingTop: 24 },
  error: { color: "#b91c1c", fontSize: 13, marginTop: 8, textAlign: "center" },
});
