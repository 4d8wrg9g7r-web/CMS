import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import { WebView } from "react-native-webview";
import { fetchApp, resolveUrl } from "../api";
import type { AppPayload, AppTab } from "../contract";
import { Feed } from "../components/Feed";
import { PageBlocks } from "../components/PageBlocks";

/**
 * One church's app (docs/domain/app.md), rendered natively from the same
 * payload the web PWA uses. Link semantics get their native upgrade here:
 * in-app links open expo-web-browser (SFSafariViewController / Custom Tabs),
 * external links open the system browser, tab links switch the bottom bar.
 */

function tabLabel(tab: AppTab): string {
  switch (tab.kind) {
    case "home":
      return "Home";
    case "events":
      return "Events";
    case "sermons":
      return "Media";
    case "groups":
      return "Groups";
    case "forms":
      return "Connect";
    case "giving":
      return "Give";
    case "livestream":
      return "Live";
    case "link":
    case "page":
      return tab.label;
  }
}

function tabIcon(tab: AppTab): string {
  switch (tab.kind) {
    case "home":
      return "🏠";
    case "events":
      return "📅";
    case "sermons":
      return "▶️";
    case "groups":
      return "👥";
    case "forms":
      return "📋";
    case "giving":
      return "❤️";
    case "livestream":
      return "📡";
    case "page":
      return "📄";
    case "link":
      return "🔗";
  }
}

/** Mirror of toEmbedUrl in @cms/database (canonical) — keep in sync. */
function embedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = parsed.pathname.slice(1).split("/")[0];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsed.pathname === "/watch") {
        const id = parsed.searchParams.get("v");
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
      if (parsed.pathname.startsWith("/embed/")) return url;
      if (parsed.pathname.startsWith("/live/")) {
        const id = parsed.pathname.split("/")[2];
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
      return null;
    }
    if (host === "vimeo.com") {
      const id = parsed.pathname.slice(1).split("/")[0] ?? "";
      return /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
    }
    if (host === "player.vimeo.com") return url;
    return null;
  } catch {
    return null;
  }
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function ChurchAppScreen({ publicAppId, onSwitchChurch }: { publicAppId: string; onSwitchChurch: (() => void) | null }) {
  const [payload, setPayload] = useState<AppPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setPayload(await fetchApp(publicAppId));
      setError(null);
    } catch {
      setError("Could not load the app. Pull to retry.");
    }
  }, [publicAppId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!payload) {
    return (
      <View style={styles.loading}>
        {error ? (
          <Pressable onPress={() => void load()}>
            <Text style={styles.errorText}>{error}</Text>
          </Pressable>
        ) : (
          <ActivityIndicator size="large" />
        )}
      </View>
    );
  }

  const { manifest, content, feed, organization_name: churchName } = payload;
  const accent = manifest.themeColor;
  const tab = manifest.tabs[Math.min(active, manifest.tabs.length - 1)] ?? manifest.tabs[0]!;

  const body = (() => {
    switch (tab.kind) {
      case "home":
        return (
          <View style={styles.column}>
            <View style={[styles.welcome, { backgroundColor: accent }]}>
              <Text style={styles.welcomeText}>{manifest.welcome || `Welcome to ${churchName}!`}</Text>
              {manifest.givingUrl && (
                <Pressable style={styles.welcomeGive} onPress={() => void WebBrowser.openBrowserAsync(manifest.givingUrl!)}>
                  <Text style={[styles.welcomeGiveText, { color: accent }]}>❤️ Give</Text>
                </Pressable>
              )}
            </View>
            <Feed posts={feed} accent={accent} churchName={churchName} />
          </View>
        );
      case "events":
        return content.events.length === 0 ? (
          <Text style={styles.empty}>No upcoming events</Text>
        ) : (
          <View style={styles.column}>
            {content.events.map((event) => (
              <Card key={event.id}>
                <Text style={styles.itemTitle}>{event.title}</Text>
                <Text style={styles.itemMeta}>{event.when}</Text>
                {event.location && <Text style={styles.itemMeta}>📍 {event.location}</Text>}
              </Card>
            ))}
          </View>
        );
      case "sermons":
        return content.sermons.length === 0 ? (
          <Text style={styles.empty}>No sermons yet</Text>
        ) : (
          <View style={styles.column}>
            {content.sermons.map((sermon) => (
              <Card key={sermon.id}>
                <Text style={styles.itemMeta}>
                  {sermon.when}
                  {sermon.series ? ` · ${sermon.series}` : ""}
                </Text>
                <Text style={styles.itemTitle}>{sermon.title}</Text>
                {(sermon.speaker || sermon.passage) && (
                  <Text style={styles.itemMeta}>{[sermon.speaker, sermon.passage].filter(Boolean).join(" · ")}</Text>
                )}
                {sermon.videoUrl && (
                  <Pressable onPress={() => void WebBrowser.openBrowserAsync(sermon.videoUrl!)}>
                    <Text style={[styles.link, { color: accent }]}>▶ Watch</Text>
                  </Pressable>
                )}
              </Card>
            ))}
          </View>
        );
      case "groups":
        return content.groups.length === 0 ? (
          <Text style={styles.empty}>No groups right now</Text>
        ) : (
          <View style={styles.column}>
            {content.groups.map((group) => (
              <Card key={group.id}>
                <Text style={styles.itemTitle}>{group.name}</Text>
                {group.description && <Text style={styles.itemMeta}>{group.description}</Text>}
              </Card>
            ))}
          </View>
        );
      case "forms":
        return content.forms.length === 0 ? (
          <Text style={styles.empty}>Nothing to fill out right now</Text>
        ) : (
          <View style={styles.column}>
            {content.forms.map((form) => (
              <Pressable key={form.id} onPress={() => void WebBrowser.openBrowserAsync(resolveUrl(form.href))}>
                <Card>
                  <Text style={styles.itemTitle}>{form.title} →</Text>
                </Card>
              </Pressable>
            ))}
          </View>
        );
      case "giving":
        return (
          <View style={styles.give}>
            <Text style={styles.giveIcon}>❤️</Text>
            <Text style={styles.giveText}>Your generosity makes ministry happen. Thank you.</Text>
            {manifest.givingUrl ? (
              <Pressable
                style={[styles.giveButton, { backgroundColor: accent }]}
                onPress={() => void WebBrowser.openBrowserAsync(manifest.givingUrl!)}
              >
                <Text style={styles.giveButtonText}>Give now</Text>
              </Pressable>
            ) : (
              <Text style={styles.empty}>Giving isn&apos;t set up yet</Text>
            )}
          </View>
        );
      case "livestream": {
        const embed = embedUrl(tab.url);
        return (
          <View style={styles.column}>
            {embed ? (
              <View style={styles.player}>
                <WebView source={{ uri: embed }} allowsFullscreenVideo style={styles.playerWebview} />
              </View>
            ) : null}
            <Pressable
              style={[styles.giveButton, { backgroundColor: accent }]}
              onPress={() => void WebBrowser.openBrowserAsync(tab.url)}
            >
              <Text style={styles.giveButtonText}>Watch the livestream</Text>
            </Pressable>
          </View>
        );
      }
      case "page": {
        const page = content.pages.find((p) => p.id === tab.pageId);
        return page && page.blocks.length > 0 ? (
          <PageBlocks blocks={page.blocks} accent={accent} tabs={manifest.tabs} selectTab={setActive} />
        ) : (
          <Text style={styles.empty}>This page is being worked on — check back soon</Text>
        );
      }
      case "link":
        return (
          <View style={styles.give}>
            <Pressable style={[styles.giveButton, { backgroundColor: accent }]} onPress={() => void Linking.openURL(tab.url)}>
              <Text style={styles.giveButtonText}>{tabLabel(tab)} ↗</Text>
            </Pressable>
          </View>
        );
    }
  })();

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { backgroundColor: accent }]}>
        {manifest.logoUrl && <Image source={{ uri: manifest.logoUrl }} style={styles.headerLogo} />}
        <Text style={styles.headerTitle} numberOfLines={1}>
          {manifest.appName || churchName}
        </Text>
        {onSwitchChurch && (
          <Pressable onPress={onSwitchChurch} hitSlop={8}>
            <Text style={styles.switchChurch}>Switch</Text>
          </Pressable>
        )}
      </View>
      <ScrollView
        style={styles.main}
        contentContainerStyle={styles.mainContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
          />
        }
      >
        {body}
      </ScrollView>
      <View style={styles.tabBar}>
        {manifest.tabs.map((t, i) => {
          const isActive = i === Math.min(active, manifest.tabs.length - 1);
          if (t.kind === "link") {
            return (
              <Pressable key={i} style={styles.tab} onPress={() => void Linking.openURL(t.url)}>
                <Text style={styles.tabIcon}>{tabIcon(t)}</Text>
                <Text style={[styles.tabLabel, { color: "#8a8985" }]} numberOfLines={1}>
                  {tabLabel(t)}
                </Text>
              </Pressable>
            );
          }
          return (
            <Pressable key={i} style={styles.tab} onPress={() => setActive(i)}>
              <Text style={[styles.tabIcon, !isActive && styles.tabIconInactive]}>{tabIcon(t)}</Text>
              <Text style={[styles.tabLabel, { color: isActive ? accent : "#8a8985" }]} numberOfLines={1}>
                {tabLabel(t)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f4" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f4" },
  errorText: { color: "#b91c1c", fontSize: 14, padding: 20, textAlign: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 54, paddingBottom: 14 },
  headerLogo: { width: 34, height: 34, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.2)" },
  headerTitle: { flex: 1, color: "#ffffff", fontSize: 18, fontWeight: "800" },
  switchChurch: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "600" },
  main: { flex: 1 },
  mainContent: { padding: 16 },
  column: { gap: 12 },
  welcome: { borderRadius: 14, padding: 18 },
  welcomeText: { color: "#ffffff", fontSize: 17, fontWeight: "700", lineHeight: 24 },
  welcomeGive: { alignSelf: "flex-start", backgroundColor: "#ffffff", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, marginTop: 12 },
  welcomeGiveText: { fontSize: 14, fontWeight: "700" },
  card: { backgroundColor: "#ffffff", borderRadius: 12, borderWidth: 1, borderColor: "#e5e5e5", padding: 14, gap: 2 },
  itemTitle: { fontSize: 15, fontWeight: "600", color: "#171717" },
  itemMeta: { fontSize: 13, color: "#737373" },
  link: { fontSize: 14, fontWeight: "700", marginTop: 6 },
  empty: { textAlign: "center", color: "#737373", fontSize: 14, paddingTop: 28 },
  give: { alignItems: "center", paddingTop: 32, gap: 14 },
  giveIcon: { fontSize: 40 },
  giveText: { textAlign: "center", color: "#525252", fontSize: 14, maxWidth: 240 },
  giveButton: { borderRadius: 24, paddingHorizontal: 30, paddingVertical: 13 },
  giveButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  player: { borderRadius: 12, overflow: "hidden", aspectRatio: 16 / 9, backgroundColor: "#000000" },
  playerWebview: { flex: 1 },
  tabBar: { flexDirection: "row", backgroundColor: "#ffffff", borderTopWidth: 1, borderTopColor: "#e5e5e5", paddingBottom: 22, paddingTop: 6 },
  tab: { flex: 1, alignItems: "center", gap: 2 },
  tabIcon: { fontSize: 18 },
  tabIconInactive: { opacity: 0.45 },
  tabLabel: { fontSize: 10, fontWeight: "600" },
});
