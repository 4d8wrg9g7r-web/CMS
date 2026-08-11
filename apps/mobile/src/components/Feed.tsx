import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { FeedComment, FeedPost } from "../contract";

/**
 * The community feed, now interactive when a member is signed in: reactions
 * (❤️🙏🙌🎉 — one per person, same emoji toggles off), comments, and one-level
 * replies. Signed-out it renders the church-announcement view read-only.
 */

const REACTIONS = ["❤️", "🙏", "🙌", "🎉"] as const;

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

export interface FeedActions {
  onReact: (postId: string, emoji: string) => Promise<void>;
  onComment: (postId: string, body: string, parentCommentId: string | null) => Promise<void>;
}

function CommentRow({
  comment,
  postId,
  actions,
  isReply = false,
}: {
  comment: FeedComment;
  postId: string;
  actions: FeedActions | null;
  isReply?: boolean;
}) {
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <View style={isReply ? styles.replyRow : styles.commentRow}>
      <Text style={styles.commentText}>
        <Text style={styles.commentAuthor}>{comment.authorName}</Text> {comment.body}
      </Text>
      {actions && !isReply && (
        <Pressable onPress={() => setReplying((v) => !v)} hitSlop={6}>
          <Text style={styles.replyLink}>Reply</Text>
        </Pressable>
      )}
      {comment.replies.map((r) => (
        <CommentRow key={r.id} comment={r} postId={postId} actions={actions} isReply />
      ))}
      {replying && actions && (
        <View style={styles.commentForm}>
          <TextInput
            value={reply}
            onChangeText={setReply}
            placeholder={`Reply to ${comment.authorName.split(" ")[0]}…`}
            placeholderTextColor="#a3a3a3"
            style={styles.commentInput}
            maxLength={300}
          />
          <Pressable
            disabled={busy || !reply.trim()}
            onPress={async () => {
              setBusy(true);
              await actions.onComment(postId, reply.trim(), comment.id).catch(() => undefined);
              setBusy(false);
              setReply("");
              setReplying(false);
            }}
          >
            <Text style={styles.sendLink}>Send</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function PostCard({
  post,
  accent,
  churchName,
  actions,
}: {
  post: FeedPost;
  accent: string;
  churchName: string;
  actions: FeedActions | null;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const react = async (emoji: string) => {
    if (!actions) return;
    setPickerOpen(false);
    await actions.onReact(post.id, emoji).catch(() => undefined);
  };

  return (
    <View style={styles.card}>
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

      <View style={styles.footer}>
        {post.reactions.map((r) => (
          <Pressable
            key={r.emoji}
            disabled={!actions}
            onPress={() => void react(r.emoji)}
            style={[styles.reactionChip, post.myReaction === r.emoji && { borderColor: accent }]}
          >
            <Text style={styles.reactionText}>
              {r.emoji} {r.count}
            </Text>
          </Pressable>
        ))}
        {actions && (
          <Pressable onPress={() => setPickerOpen((v) => !v)} hitSlop={6}>
            <Text style={styles.footerAction}>😊+</Text>
          </Pressable>
        )}
        <Pressable onPress={() => setCommenting((v) => !v)} hitSlop={6} disabled={!actions && post.commentCount === 0}>
          <Text style={styles.footerAction}>💬 {post.commentCount > 0 ? post.commentCount : ""}</Text>
        </Pressable>
      </View>

      {pickerOpen && actions && (
        <View style={styles.picker}>
          {REACTIONS.map((emoji) => (
            <Pressable key={emoji} onPress={() => void react(emoji)} hitSlop={6}>
              <Text style={styles.pickerEmoji}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {(post.comments.length > 0 || commenting) && (
        <View style={styles.comments}>
          {post.comments.map((c) => (
            <CommentRow key={c.id} comment={c} postId={post.id} actions={actions} />
          ))}
          {commenting && actions && (
            <View style={styles.commentForm}>
              <TextInput
                value={comment}
                onChangeText={setComment}
                placeholder="Write a comment…"
                placeholderTextColor="#a3a3a3"
                style={styles.commentInput}
                maxLength={300}
              />
              <Pressable
                disabled={busy || !comment.trim()}
                onPress={async () => {
                  setBusy(true);
                  await actions.onComment(post.id, comment.trim(), null).catch(() => undefined);
                  setBusy(false);
                  setComment("");
                }}
              >
                <Text style={styles.sendLink}>Send</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

export function Feed({
  posts,
  accent,
  churchName,
  actions = null,
}: {
  posts: FeedPost[];
  accent: string;
  churchName: string;
  /** Present when a member is signed in — enables reactions/comments. */
  actions?: FeedActions | null;
}) {
  if (posts.length === 0) {
    return <Text style={styles.empty}>Nothing here yet — check back soon.</Text>;
  }
  return (
    <View style={styles.column}>
      {posts.map((post) => (
        <PostCard key={post.id} post={post} accent={accent} churchName={churchName} actions={actions} />
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
  footer: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" },
  reactionChip: { borderWidth: 1, borderColor: "#e5e5e5", borderRadius: 14, paddingHorizontal: 8, paddingVertical: 3 },
  reactionText: { fontSize: 12, color: "#404040" },
  footerAction: { fontSize: 13, color: "#737373" },
  picker: { flexDirection: "row", gap: 14, marginTop: 8, padding: 8, backgroundColor: "#fafafa", borderRadius: 12, alignSelf: "flex-start" },
  pickerEmoji: { fontSize: 22 },
  comments: { borderTopWidth: 1, borderTopColor: "#f0f0ef", marginTop: 10, paddingTop: 6 },
  commentRow: { marginTop: 6 },
  replyRow: { marginTop: 4, marginLeft: 18 },
  commentText: { fontSize: 13, color: "#404040", lineHeight: 18 },
  commentAuthor: { fontWeight: "700", color: "#171717" },
  replyLink: { fontSize: 11, color: "#a3a3a3", marginTop: 2 },
  commentForm: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    fontSize: 13,
    color: "#171717",
    backgroundColor: "#fafafa",
  },
  sendLink: { fontSize: 13, fontWeight: "700", color: "#525252" },
  empty: { textAlign: "center", color: "#737373", fontSize: 14, paddingTop: 32 },
});
