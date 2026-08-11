import { Image, StyleSheet, Text, View } from "react-native";
import type { FeedPost } from "../contract";

/**
 * Read-only community feed (signed-out view: church announcements). Member
 * sign-in + posting arrive with token auth in a later phase — the web PWA
 * already has the full interactive feed.
 */

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

export function Feed({ posts, accent, churchName }: { posts: FeedPost[]; accent: string; churchName: string }) {
  if (posts.length === 0) {
    return <Text style={styles.empty}>Nothing here yet — check back soon.</Text>;
  }
  return (
    <View style={styles.column}>
      {posts.map((post) => (
        <View key={post.id} style={styles.card}>
          <View style={styles.header}>
            {post.authorAvatarUrl ? (
              <Image source={{ uri: post.authorAvatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: post.kind === "CHURCH" ? accent : "#8a8985" }]}>
                <Text style={styles.avatarInitial}>
                  {(post.kind === "CHURCH" ? churchName : (post.authorName ?? "?")).charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.headerText}>
              <Text style={styles.author} numberOfLines={1}>
                {post.kind === "CHURCH" ? churchName : post.authorName}
              </Text>
              <Text style={styles.meta}>
                {timeAgo(post.createdAt)}
                {post.groupName ? ` · ${post.groupName}` : ""}
                {post.kind === "CHURCH" ? " · Announcement" : ""}
              </Text>
            </View>
          </View>
          {post.body ? <Text style={styles.body}>{post.body}</Text> : null}
          {post.imageUrl ? <Image source={{ uri: post.imageUrl }} style={styles.photo} resizeMode="cover" /> : null}
          {(post.reactions.length > 0 || post.commentCount > 0) && (
            <Text style={styles.engagement}>
              {post.reactions.map((r) => `${r.emoji} ${r.count}`).join("  ")}
              {post.commentCount > 0 ? `   💬 ${post.commentCount}` : ""}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: 12 },
  card: { backgroundColor: "#ffffff", borderRadius: 12, borderWidth: 1, borderColor: "#e5e5e5", padding: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: "#ffffff", fontWeight: "700", fontSize: 15 },
  headerText: { flex: 1, minWidth: 0 },
  author: { fontSize: 14, fontWeight: "600", color: "#171717" },
  meta: { fontSize: 12, color: "#737373" },
  body: { fontSize: 14, lineHeight: 20, color: "#262626" },
  photo: { width: "100%", aspectRatio: 4 / 3, borderRadius: 10, marginTop: 8, backgroundColor: "#e5e5e2" },
  engagement: { marginTop: 10, fontSize: 12, color: "#737373" },
  empty: { textAlign: "center", color: "#737373", fontSize: 14, paddingTop: 32 },
});
