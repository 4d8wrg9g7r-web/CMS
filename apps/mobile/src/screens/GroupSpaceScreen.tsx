import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import {
  closeGroupPoll,
  createGroupEvent,
  createGroupPoll,
  fetchGroupSpace,
  moderateGroupPost,
  postToGroup,
  rsvpGroupEvent,
  togglePraying,
  voteGroupPoll,
} from "../api";
import type { GroupSpace, GroupStreamItem } from "../contract";

/**
 * The native group space (docs/domain/groups.md) — same payload and rules as
 * the PWA's GroupSpaceView: chat/links/prayer stream with praying toggles,
 * group-only events with RSVP, polls, and leader tools (moderation, new
 * event, new poll). Attendance sheets, member management, and group email
 * stay on the web/dashboard for now — the Lead tab says so.
 */

const RSVP_OPTIONS = [
  { status: "GOING" as const, label: "Going" },
  { status: "MAYBE" as const, label: "Maybe" },
  { status: "NO" as const, label: "Can't" },
];

function timeAgo(iso: string): string {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d ago` : new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function eventWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type TabKey = "chat" | "events" | "polls" | "lead";
type PostKind = "MESSAGE" | "LINK" | "PRAYER";

export function GroupSpaceScreen({
  publicAppId,
  groupId,
  token,
  accent,
  onClose,
}: {
  publicAppId: string;
  groupId: string;
  token: string;
  accent: string;
  onClose: () => void;
}) {
  const [space, setSpace] = useState<GroupSpace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<TabKey>("chat");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Composer
  const [kind, setKind] = useState<PostKind>("MESSAGE");
  const [draft, setDraft] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [anonymous, setAnonymous] = useState(false);

  // Leader forms
  const [eventTitle, setEventTitle] = useState("");
  const [eventWhenDraft, setEventWhenDraft] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState("");
  const [leadNotice, setLeadNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSpace(await fetchGroupSpace(publicAppId, token, groupId));
      setError(null);
    } catch {
      setError("Could not load this group. Pull to retry.");
    }
  }, [publicAppId, token, groupId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Run a member/leader action, then refresh the space; errors surface inline. */
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Something went wrong");
    }
    setBusy(false);
  };

  if (!space) {
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

  const isLeader = space.viewer.isLeader;
  const tabs: { key: TabKey; label: string }[] = [
    { key: "chat", label: "Chat" },
    { key: "events", label: "Events" },
    { key: "polls", label: "Polls" },
    ...(isLeader ? [{ key: "lead" as const, label: "Lead" }] : []),
  ];

  const submitPost = () =>
    act(async () => {
      await postToGroup(publicAppId, token, groupId, {
        kind,
        body: draft.trim(),
        url: kind === "LINK" ? draftUrl.trim() : null,
        anonymous: kind === "PRAYER" ? anonymous : false,
      });
      setDraft("");
      setDraftUrl("");
      setAnonymous(false);
      setKind("MESSAGE");
    });

  const canSubmit = kind === "LINK" ? draftUrl.trim().length > 0 : draft.trim().length > 0;

  const streamItem = (post: GroupStreamItem) => (
    <View key={post.id} style={[styles.post, post.kind === "PRAYER" && styles.prayerPost, post.hidden && styles.hiddenPost]}>
      <View style={styles.postHeader}>
        <View style={styles.postAuthorRow}>
          {post.authorAvatarUrl ? (
            <Image source={{ uri: post.authorAvatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarFallbackText}>{(post.authorName ?? "•").slice(0, 1)}</Text>
            </View>
          )}
          <Text style={styles.postAuthor} numberOfLines={1}>
            {post.isStaff ? "Your church" : (post.authorName ?? "Anonymous")}
          </Text>
          <Text style={styles.postMeta}>· {timeAgo(post.createdAt)}</Text>
          {post.kind === "PRAYER" && <Text style={styles.prayerTag}>Prayer</Text>}
          {post.hidden && <Text style={styles.hiddenTag}>Hidden</Text>}
        </View>
        {isLeader && (
          <Pressable disabled={busy} onPress={() => void act(() => moderateGroupPost(publicAppId, token, groupId, post.id, !post.hidden))} hitSlop={8}>
            <Text style={styles.moderate}>{post.hidden ? "↩︎" : "🚫"}</Text>
          </Pressable>
        )}
      </View>
      {post.body.length > 0 && <Text style={styles.postBody}>{post.body}</Text>}
      {post.kind === "LINK" && post.url && (
        <Pressable onPress={() => void WebBrowser.openBrowserAsync(post.url!)}>
          <Text style={[styles.postLink, { color: accent }]} numberOfLines={1}>
            🔗 {post.url}
          </Text>
        </Pressable>
      )}
      {post.kind === "PRAYER" && (
        <Pressable
          disabled={busy}
          onPress={() => void act(() => togglePraying(publicAppId, token, groupId, post.id))}
          style={[styles.prayingChip, post.prayingByMe && { borderColor: accent, backgroundColor: "#ffffff" }]}
        >
          <Text style={[styles.prayingChipText, post.prayingByMe && { color: accent, fontWeight: "700" }]}>
            🙏 {post.prayingByMe ? "Praying" : "I'm praying"}
            {post.prayingCount > 0 ? ` · ${post.prayingCount}` : ""}
          </Text>
        </Pressable>
      )}
    </View>
  );

  const body = (() => {
    switch (tab) {
      case "chat":
        return (
          <View style={styles.column}>
            <View style={styles.composer}>
              <View style={styles.kindRow}>
                {(
                  [
                    { k: "MESSAGE" as const, label: "💬 Message" },
                    { k: "LINK" as const, label: "🔗 Link" },
                    { k: "PRAYER" as const, label: "🙏 Prayer" },
                  ] as const
                ).map(({ k, label }) => (
                  <Pressable key={k} onPress={() => setKind(k)} style={[styles.kindChip, kind === k && { borderColor: accent }]}>
                    <Text style={[styles.kindChipText, kind === k && { color: accent, fontWeight: "700" }]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={
                  kind === "PRAYER"
                    ? "What can your group pray for?"
                    : kind === "LINK"
                      ? "Say something about the link (optional)…"
                      : "Message your group…"
                }
                placeholderTextColor="#a3a3a3"
                multiline
                maxLength={2000}
                style={styles.composerInput}
              />
              {kind === "LINK" && (
                <TextInput
                  value={draftUrl}
                  onChangeText={setDraftUrl}
                  placeholder="https://…"
                  placeholderTextColor="#a3a3a3"
                  autoCapitalize="none"
                  keyboardType="url"
                  style={styles.urlInput}
                />
              )}
              <View style={styles.composerRow}>
                {kind === "PRAYER" ? (
                  <View style={styles.anonRow}>
                    <Switch value={anonymous} onValueChange={setAnonymous} />
                    <Text style={styles.anonLabel}>Post anonymously</Text>
                  </View>
                ) : (
                  <View />
                )}
                <Pressable
                  onPress={() => void submitPost()}
                  disabled={busy || !canSubmit}
                  style={[styles.sendButton, { backgroundColor: accent, opacity: busy || !canSubmit ? 0.5 : 1 }]}
                >
                  <Text style={styles.sendButtonText}>Send</Text>
                </Pressable>
              </View>
            </View>
            {space.stream.length === 0 ? (
              <Text style={styles.empty}>Say hello — your group will see it here.</Text>
            ) : (
              [...space.stream].reverse().map(streamItem)
            )}
          </View>
        );
      case "events":
        return space.events.length === 0 ? (
          <Text style={styles.empty}>No group events planned yet.</Text>
        ) : (
          <View style={styles.column}>
            {space.events.map((event) => (
              <View key={event.id} style={styles.card}>
                <Text style={styles.itemTitle}>{event.title}</Text>
                <Text style={styles.itemMeta}>
                  {eventWhen(event.startAt)}
                  {event.location ? ` · 📍 ${event.location}` : ""}
                </Text>
                {event.description && <Text style={styles.itemMeta}>{event.description}</Text>}
                <Text style={styles.rsvpCounts}>
                  {event.going} going{event.maybe > 0 ? ` · ${event.maybe} maybe` : ""}
                </Text>
                <View style={styles.rsvpRow}>
                  {RSVP_OPTIONS.map(({ status, label }) => {
                    const mine = event.myRsvp === status;
                    return (
                      <Pressable
                        key={status}
                        disabled={busy}
                        onPress={() => void act(() => rsvpGroupEvent(publicAppId, token, groupId, event.id, status))}
                        style={[styles.rsvpChip, mine && { backgroundColor: accent, borderColor: accent }]}
                      >
                        <Text style={[styles.rsvpChipText, mine && styles.rsvpChipTextOn]}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        );
      case "polls":
        return space.polls.length === 0 ? (
          <Text style={styles.empty}>No polls yet.</Text>
        ) : (
          <View style={styles.column}>
            {space.polls.map((poll) => (
              <View key={poll.id} style={styles.card}>
                <View style={styles.pollHeader}>
                  <Text style={[styles.itemTitle, styles.pollQuestion]}>{poll.question}</Text>
                  {poll.closed ? (
                    <Text style={styles.closedTag}>Closed</Text>
                  ) : (
                    isLeader && (
                      <Pressable disabled={busy} onPress={() => void act(() => closeGroupPoll(publicAppId, token, groupId, poll.id))} hitSlop={8}>
                        <Text style={styles.closePoll}>Close</Text>
                      </Pressable>
                    )
                  )}
                </View>
                <View style={styles.pollOptions}>
                  {poll.options.map((option, i) => {
                    const count = poll.counts[i] ?? 0;
                    const pct = poll.totalVotes > 0 ? Math.round((count / poll.totalVotes) * 100) : 0;
                    const mine = poll.myVote === i;
                    return (
                      <Pressable
                        key={i}
                        disabled={busy || poll.closed}
                        onPress={() => void act(() => voteGroupPoll(publicAppId, token, groupId, poll.id, i))}
                        style={[styles.pollOption, mine && { borderColor: accent }]}
                      >
                        <View style={[styles.pollFill, { width: `${pct}%`, backgroundColor: `${accent}22` }]} />
                        <View style={styles.pollOptionRow}>
                          <Text style={[styles.pollOptionText, mine && { color: accent, fontWeight: "700" }]}>
                            {mine ? "✓ " : ""}
                            {option}
                          </Text>
                          <Text style={styles.pollCount}>
                            {count} · {pct}%
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.itemMeta}>
                  {poll.totalVotes} {poll.totalVotes === 1 ? "vote" : "votes"}
                  {!poll.closed && " · tap to vote — you can change it"}
                </Text>
              </View>
            ))}
          </View>
        );
      case "lead":
        return (
          <View style={styles.column}>
            {leadNotice && <Text style={styles.leadNotice}>{leadNotice}</Text>}
            <View style={styles.card}>
              <Text style={styles.itemTitle}>📅 New group event</Text>
              <TextInput
                value={eventTitle}
                onChangeText={setEventTitle}
                placeholder="Potluck at the Hendersons'"
                placeholderTextColor="#a3a3a3"
                style={styles.formInput}
              />
              <TextInput
                value={eventWhenDraft}
                onChangeText={setEventWhenDraft}
                placeholder="When — e.g. 2026-08-28 18:30"
                placeholderTextColor="#a3a3a3"
                autoCapitalize="none"
                style={styles.formInput}
              />
              <TextInput
                value={eventLocation}
                onChangeText={setEventLocation}
                placeholder="Location (optional)"
                placeholderTextColor="#a3a3a3"
                style={styles.formInput}
              />
              <Pressable
                disabled={busy || !eventTitle.trim() || Number.isNaN(new Date(eventWhenDraft.trim().replace(" ", "T")).getTime())}
                onPress={() =>
                  void act(async () => {
                    await createGroupEvent(publicAppId, token, groupId, {
                      title: eventTitle.trim(),
                      location: eventLocation.trim() || null,
                      startAt: new Date(eventWhenDraft.trim().replace(" ", "T")).toISOString(),
                    });
                    setEventTitle("");
                    setEventWhenDraft("");
                    setEventLocation("");
                    setLeadNotice("Event created — your group has been notified.");
                    setTab("events");
                  })
                }
                style={[
                  styles.sendButton,
                  styles.formButton,
                  {
                    backgroundColor: accent,
                    opacity:
                      busy || !eventTitle.trim() || Number.isNaN(new Date(eventWhenDraft.trim().replace(" ", "T")).getTime())
                        ? 0.5
                        : 1,
                  },
                ]}
              >
                <Text style={styles.sendButtonText}>Create event</Text>
              </Pressable>
            </View>

            <View style={styles.card}>
              <Text style={styles.itemTitle}>🗳️ New poll</Text>
              <TextInput
                value={pollQuestion}
                onChangeText={setPollQuestion}
                placeholder="Where should we meet next month?"
                placeholderTextColor="#a3a3a3"
                style={styles.formInput}
              />
              <TextInput
                value={pollOptions}
                onChangeText={setPollOptions}
                placeholder={"One option per line (2–10)"}
                placeholderTextColor="#a3a3a3"
                multiline
                style={[styles.formInput, styles.formTextarea]}
              />
              <Pressable
                disabled={busy || !pollQuestion.trim() || pollOptions.split("\n").filter((o) => o.trim()).length < 2}
                onPress={() =>
                  void act(async () => {
                    await createGroupPoll(publicAppId, token, groupId, {
                      question: pollQuestion.trim(),
                      options: pollOptions
                        .split("\n")
                        .map((o) => o.trim())
                        .filter(Boolean),
                    });
                    setPollQuestion("");
                    setPollOptions("");
                    setLeadNotice("Poll created — your group has been notified.");
                    setTab("polls");
                  })
                }
                style={[
                  styles.sendButton,
                  styles.formButton,
                  {
                    backgroundColor: accent,
                    opacity: busy || !pollQuestion.trim() || pollOptions.split("\n").filter((o) => o.trim()).length < 2 ? 0.5 : 1,
                  },
                ]}
              >
                <Text style={styles.sendButtonText}>Create poll</Text>
              </Pressable>
            </View>

            <View style={styles.card}>
              <Text style={styles.itemTitle}>👥 Members ({space.members.length})</Text>
              {space.members.map((m) => (
                <Text key={m.personId} style={styles.itemMeta}>
                  {m.name}
                  {m.role !== "MEMBER" ? "  · leader" : ""}
                </Text>
              ))}
              <Text style={styles.leadFootnote}>
                Attendance, adding or removing members, and emailing the group live in the web app for now.
              </Text>
            </View>
          </View>
        );
    }
  })();

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { backgroundColor: accent }]}>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {space.group.name}
          </Text>
          {(space.group.meetingSchedule || space.group.meetingLocation) && (
            <Text style={styles.headerMeta} numberOfLines={1}>
              {[space.group.meetingSchedule, space.group.meetingLocation].filter(Boolean).join(" · ")}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.tabRow}>
        {tabs.map(({ key, label }) => (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            style={[styles.tabPill, tab === key && { backgroundColor: accent }]}
          >
            <Text style={[styles.tabPillText, tab === key && styles.tabPillTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {actionError && <Text style={styles.actionError}>{actionError}</Text>}
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f5f5f4" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f5f4" },
  errorText: { color: "#b91c1c", fontSize: 14, padding: 20, textAlign: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 54, paddingBottom: 14 },
  back: { color: "rgba(255,255,255,0.9)", fontSize: 15, fontWeight: "600" },
  headerText: { flex: 1 },
  headerTitle: { color: "#ffffff", fontSize: 18, fontWeight: "800" },
  headerMeta: { color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 1 },
  tabRow: { flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "#ffffff", borderBottomWidth: 1, borderBottomColor: "#e5e5e5" },
  tabPill: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: "#f0f0ef" },
  tabPillText: { fontSize: 13, fontWeight: "600", color: "#525252" },
  tabPillTextOn: { color: "#ffffff" },
  actionError: { color: "#b91c1c", fontSize: 12, paddingHorizontal: 16, paddingTop: 8 },
  main: { flex: 1 },
  mainContent: { padding: 16 },
  column: { gap: 12 },
  composer: { backgroundColor: "#ffffff", borderRadius: 12, borderWidth: 1, borderColor: "#e5e5e5", padding: 12, gap: 10 },
  kindRow: { flexDirection: "row", gap: 6 },
  kindChip: { borderWidth: 1, borderColor: "#e5e5e5", borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  kindChipText: { fontSize: 12, color: "#525252" },
  composerInput: { fontSize: 14, color: "#171717", minHeight: 40, textAlignVertical: "top" },
  urlInput: { fontSize: 13, color: "#171717", borderWidth: 1, borderColor: "#e5e5e5", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  composerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  anonRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  anonLabel: { fontSize: 12, color: "#525252" },
  sendButton: { borderRadius: 18, paddingHorizontal: 20, paddingVertical: 9 },
  sendButtonText: { color: "#ffffff", fontSize: 13, fontWeight: "700" },
  post: { backgroundColor: "#ffffff", borderRadius: 12, borderWidth: 1, borderColor: "#e5e5e5", padding: 12, gap: 6 },
  prayerPost: { backgroundColor: "#fffbeb", borderColor: "#fde68a" },
  hiddenPost: { opacity: 0.5 },
  postHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  postAuthorRow: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  avatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#e5e5e2" },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarFallbackText: { fontSize: 11, fontWeight: "700", color: "#737373" },
  postAuthor: { fontSize: 13, fontWeight: "700", color: "#171717", flexShrink: 1 },
  postMeta: { fontSize: 11, color: "#a3a3a3" },
  prayerTag: { fontSize: 10, fontWeight: "700", color: "#b45309", backgroundColor: "#fef3c7", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, overflow: "hidden" },
  hiddenTag: { fontSize: 10, fontWeight: "700", color: "#737373", backgroundColor: "#f0f0ef", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, overflow: "hidden" },
  moderate: { fontSize: 14 },
  postBody: { fontSize: 14, color: "#262626", lineHeight: 20 },
  postLink: { fontSize: 13, fontWeight: "600" },
  prayingChip: { alignSelf: "flex-start", borderWidth: 1, borderColor: "#fde68a", borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  prayingChipText: { fontSize: 12, color: "#92400e" },
  card: { backgroundColor: "#ffffff", borderRadius: 12, borderWidth: 1, borderColor: "#e5e5e5", padding: 14, gap: 6 },
  itemTitle: { fontSize: 15, fontWeight: "600", color: "#171717" },
  itemMeta: { fontSize: 13, color: "#737373" },
  rsvpCounts: { fontSize: 12, color: "#a3a3a3" },
  rsvpRow: { flexDirection: "row", gap: 8, marginTop: 2 },
  rsvpChip: { borderWidth: 1, borderColor: "#e5e5e5", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6 },
  rsvpChipText: { fontSize: 13, fontWeight: "600", color: "#525252" },
  rsvpChipTextOn: { color: "#ffffff" },
  pollHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  pollQuestion: { flex: 1 },
  closedTag: { fontSize: 11, fontWeight: "700", color: "#737373" },
  closePoll: { fontSize: 12, color: "#a3a3a3", fontWeight: "600" },
  pollOptions: { gap: 6 },
  pollOption: { borderWidth: 1, borderColor: "#e5e5e5", borderRadius: 8, overflow: "hidden" },
  pollFill: { position: "absolute", top: 0, bottom: 0, left: 0 },
  pollOptionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 10, paddingVertical: 8 },
  pollOptionText: { fontSize: 13, color: "#262626", flexShrink: 1 },
  pollCount: { fontSize: 11, color: "#737373" },
  leadNotice: { fontSize: 13, color: "#166534", backgroundColor: "#dcfce7", borderRadius: 8, padding: 10, overflow: "hidden" },
  formInput: { fontSize: 14, color: "#171717", borderWidth: 1, borderColor: "#e5e5e5", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 },
  formTextarea: { minHeight: 70, textAlignVertical: "top" },
  formButton: { alignSelf: "flex-start" },
  leadFootnote: { fontSize: 11, color: "#a3a3a3", marginTop: 4 },
  empty: { textAlign: "center", color: "#737373", fontSize: 14, paddingTop: 28 },
});
