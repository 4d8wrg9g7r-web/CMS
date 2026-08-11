import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as WebBrowser from "expo-web-browser";
import { WebView } from "react-native-webview";
import { addComment, createPost, fetchApp, resolveUrl, setReaction, uploadPhoto } from "../api";
import { clearToken, getToken, signOut } from "../auth";
import { disablePush, enablePush, isPushEnabled } from "../push";
import type { AppPayload, AppTab } from "../contract";
import { Feed, type FeedActions } from "../components/Feed";
import { PageBlocks } from "../components/PageBlocks";
import { SignInScreen } from "./SignInScreen";

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
  const [signingIn, setSigningIn] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftGroupId, setDraftGroupId] = useState<string | null>(null);
  const [draftPhotoUrl, setDraftPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPushOn(await isPushEnabled(publicAppId));
      const stored = await getToken(publicAppId);
      const data = await fetchApp(publicAppId, stored);
      // A token that no longer resolves to a member is expired/revoked.
      if (stored && !data.member) {
        await clearToken(publicAppId);
        setToken(null);
      } else {
        setToken(stored);
      }
      setPayload(data);
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

  const { manifest, content, feed, member, my_groups: myGroups, organization_name: churchName } = payload;
  const accent = manifest.themeColor;
  const tab = manifest.tabs[Math.min(active, manifest.tabs.length - 1)] ?? manifest.tabs[0]!;

  const feedActions: FeedActions | null =
    member && token
      ? {
          onReact: async (postId, emoji) => {
            await setReaction(publicAppId, token, postId, emoji);
            await load();
          },
          onComment: async (postId, commentBody, parentCommentId) => {
            await addComment(publicAppId, token, postId, commentBody, parentCommentId);
            await load();
          },
        }
      : null;

  const attachPhoto = async () => {
    if (!token) return;
    setPostError(null);
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      quality: 0.8,
      allowsEditing: false,
    });
    const asset = picked.assets?.[0];
    if (picked.canceled || !asset) return;
    setUploadingPhoto(true);
    try {
      const url = await uploadPhoto(publicAppId, token, asset);
      setDraftPhotoUrl(url);
    } catch (err) {
      setPostError(err instanceof Error ? err.message : "Could not upload the photo");
    }
    setUploadingPhoto(false);
  };

  const submitPost = async () => {
    if (!token || (!draft.trim() && !draftPhotoUrl)) return;
    setPosting(true);
    setPostError(null);
    try {
      await createPost(publicAppId, token, { body: draft.trim(), groupId: draftGroupId, imageUrl: draftPhotoUrl });
      setDraft("");
      setDraftGroupId(null);
      setDraftPhotoUrl(null);
      await load();
    } catch (err) {
      setPostError(err instanceof Error ? err.message : "Could not post");
    }
    setPosting(false);
  };

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

            {member ? (
              <View>
                <View style={styles.memberBar}>
                  <Text style={styles.memberBarText}>
                    Signed in as <Text style={styles.memberBarName}>{member.display_name}</Text>
                  </Text>
                  <View style={styles.memberBarActions}>
                    <Pressable
                      disabled={pushBusy}
                      onPress={async () => {
                        if (!token) return;
                        setPushBusy(true);
                        setPushError(null);
                        try {
                          if (pushOn) {
                            await disablePush(publicAppId, token);
                            setPushOn(false);
                          } else {
                            await enablePush(publicAppId, token);
                            setPushOn(true);
                          }
                        } catch (err) {
                          setPushError(err instanceof Error ? err.message : "Notifications are unavailable.");
                        }
                        setPushBusy(false);
                      }}
                      hitSlop={8}
                    >
                      <Text style={[styles.memberBarAction, pushOn && styles.memberBarActionOn]}>
                        {pushBusy ? "…" : pushOn ? "🔔 On" : "🔕 Notify me"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={async () => {
                        await signOut(publicAppId);
                        setToken(null);
                        await load();
                      }}
                      hitSlop={8}
                    >
                      <Text style={styles.memberBarAction}>Sign out</Text>
                    </Pressable>
                  </View>
                </View>
                {pushError && <Text style={styles.pushError}>{pushError}</Text>}
              </View>
            ) : (
              <Pressable style={styles.signInBanner} onPress={() => setSigningIn(true)}>
                <Text style={[styles.signInBannerText, { color: accent }]}>
                  Sign in to post and see your church family&apos;s updates →
                </Text>
              </Pressable>
            )}

            {member && manifest.allowMemberPosts && (
              <View style={styles.composer}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Share something with your church family…"
                  placeholderTextColor="#a3a3a3"
                  multiline
                  maxLength={1000}
                  style={styles.composerInput}
                />
                {draftPhotoUrl && (
                  <View>
                    <Image source={{ uri: draftPhotoUrl }} style={styles.draftPhoto} resizeMode="cover" />
                    <Pressable style={styles.draftPhotoRemove} onPress={() => setDraftPhotoUrl(null)} hitSlop={8}>
                      <Text style={styles.draftPhotoRemoveText}>✕</Text>
                    </Pressable>
                  </View>
                )}
                <View style={styles.composerRow}>
                  <Pressable onPress={() => void attachPhoto()} disabled={uploadingPhoto} hitSlop={6}>
                    <Text style={styles.attachPhoto}>{uploadingPhoto ? "⏳" : "📷"}</Text>
                  </Pressable>
                  {(myGroups ?? []).length > 0 ? (
                    <View style={styles.audienceRow}>
                      <Pressable onPress={() => setDraftGroupId(null)} style={[styles.audienceChip, draftGroupId === null && { borderColor: accent }]}>
                        <Text style={styles.audienceChipText}>Everyone</Text>
                      </Pressable>
                      {(myGroups ?? []).map((g) => (
                        <Pressable key={g.id} onPress={() => setDraftGroupId(g.id)} style={[styles.audienceChip, draftGroupId === g.id && { borderColor: accent }]}>
                          <Text style={styles.audienceChipText}>{g.name}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : (
                    <View />
                  )}
                  <Pressable
                    onPress={() => void submitPost()}
                    disabled={posting || uploadingPhoto || (!draft.trim() && !draftPhotoUrl)}
                    style={[
                      styles.postButton,
                      { backgroundColor: accent, opacity: posting || uploadingPhoto || (!draft.trim() && !draftPhotoUrl) ? 0.5 : 1 },
                    ]}
                  >
                    <Text style={styles.postButtonText}>Post</Text>
                  </Pressable>
                </View>
                {postError && <Text style={styles.postError}>{postError}</Text>}
              </View>
            )}

            <Feed posts={feed} accent={accent} churchName={churchName} actions={feedActions} />
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
      <Modal visible={signingIn} animationType="slide" onRequestClose={() => setSigningIn(false)}>
        <SignInScreen
          publicAppId={publicAppId}
          appName={manifest.appName || churchName}
          accent={accent}
          onSignedIn={() => {
            setSigningIn(false);
            void load();
          }}
          onCancel={() => setSigningIn(false)}
        />
      </Modal>
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
  memberBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 },
  memberBarText: { fontSize: 12, color: "#737373" },
  memberBarName: { fontWeight: "700", color: "#404040" },
  memberBarActions: { flexDirection: "row", alignItems: "center", gap: 14 },
  memberBarAction: { fontSize: 12, color: "#a3a3a3" },
  memberBarActionOn: { color: "#404040", fontWeight: "600" },
  pushError: { fontSize: 11, color: "#b91c1c", paddingHorizontal: 4, marginTop: 2 },
  signInBanner: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#d4d4d4",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  signInBannerText: { fontSize: 14, fontWeight: "600" },
  composer: { backgroundColor: "#ffffff", borderRadius: 12, borderWidth: 1, borderColor: "#e5e5e5", padding: 12, gap: 10 },
  composerInput: { fontSize: 14, color: "#171717", minHeight: 44, textAlignVertical: "top" },
  composerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  audienceRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, flex: 1 },
  audienceChip: { borderWidth: 1, borderColor: "#e5e5e5", borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  audienceChipText: { fontSize: 12, color: "#404040" },
  postButton: { borderRadius: 18, paddingHorizontal: 20, paddingVertical: 9 },
  postButtonText: { color: "#ffffff", fontSize: 13, fontWeight: "700" },
  postError: { color: "#b91c1c", fontSize: 12 },
  attachPhoto: { fontSize: 20 },
  draftPhoto: { width: "100%", aspectRatio: 4 / 3, borderRadius: 10, backgroundColor: "#e5e5e2" },
  draftPhotoRemove: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  draftPhotoRemoveText: { color: "#ffffff", fontSize: 12, fontWeight: "700" },
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
