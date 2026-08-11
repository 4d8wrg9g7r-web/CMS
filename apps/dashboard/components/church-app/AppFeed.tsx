"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Church, ImagePlus, Loader2, LogOut, MessageCircle, Send, SmilePlus, X } from "lucide-react";
import type { FeedComment, FeedPost } from "@cms/database";
import { REACTION_EMOJIS_UI } from "../../lib/app-manifest-ui";
import { PushToggle } from "./PushToggle";
import {
  addAppCommentAction,
  createAppPostAction,
  setAppReactionAction,
  signOutAppAction,
  uploadAppPhotoAction,
  type PostFormState,
} from "../../app/a/[publicAppId]/actions";

/**
 * The community feed (docs/domain/app.md) rendered inside the app's Home tab.
 * Interactive on the public app (composer, reactions, threaded comments via
 * server actions); App Studio's preview renders the same cards through
 * previewMode, which disables every action so the phone frame never navigates
 * the studio.
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

function Avatar({
  name,
  photoUrl,
  isChurch,
  accent,
  size = 36,
}: {
  name: string | null;
  photoUrl: string | null;
  isChurch?: boolean;
  accent: string;
  size?: number;
}) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- member-uploaded avatar
    return <img src={photoUrl} alt="" style={{ width: size, height: size }} className="shrink-0 rounded-full object-cover" />;
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, backgroundColor: isChurch ? accent : "#8a8985", fontSize: size * 0.4 }}
    >
      {isChurch ? <Church size={size * 0.45} /> : (name ?? "?").charAt(0).toUpperCase()}
    </span>
  );
}

function profileHref(publicAppId: string, personId: string) {
  return `/a/${publicAppId}/profile/${personId}`;
}

function Composer({ publicAppId, groups, accent }: { publicAppId: string; groups: { id: string; name: string }[]; accent: string }) {
  const [state, formAction, pending] = useActionState<PostFormState, FormData>(
    createAppPostAction.bind(null, publicAppId),
    { error: null },
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const attachPhoto = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    const fd = new FormData();
    fd.set("file", file);
    const result = await uploadAppPhotoAction(publicAppId, fd);
    setUploading(false);
    if ("error" in result) setUploadError(result.error);
    else setPhotoUrl(result.url);
  };

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        formAction(fd);
        formRef.current?.reset();
        setPhotoUrl("");
      }}
      className="rounded-xl border border-neutral-200 bg-white p-3"
    >
      <textarea
        name="body"
        rows={2}
        required={!photoUrl}
        maxLength={1000}
        placeholder="Share something with your church family…"
        className="w-full resize-none border-0 text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
      />
      <input type="hidden" name="imageUrl" value={photoUrl} />
      {photoUrl && (
        <div className="relative mt-1">
          {/* eslint-disable-next-line @next/next/no-img-element -- member-uploaded photo preview */}
          <img src={photoUrl} alt="Attached" className="max-h-48 w-full rounded-lg object-cover" />
          <button
            type="button"
            aria-label="Remove photo"
            onClick={() => setPhotoUrl("")}
            className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white"
          >
            <X size={13} />
          </button>
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <label className="cursor-pointer text-neutral-400 hover:text-neutral-700" aria-label="Attach a photo">
            {uploading ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void attachPhoto(file);
                e.target.value = "";
              }}
            />
          </label>
          {groups.length > 0 && (
            <select name="groupId" className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-700">
              <option value="">Everyone</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <button
          type="submit"
          disabled={pending || uploading}
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: accent }}
        >
          <Send size={13} /> Post
        </button>
      </div>
      {(state.error || uploadError) && <p className="mt-2 text-xs text-red-600">{state.error ?? uploadError}</p>}
    </form>
  );
}

function CommentForm({
  publicAppId,
  postId,
  parentCommentId,
  placeholder,
}: {
  publicAppId: string;
  postId: string;
  parentCommentId: string | null;
  placeholder: string;
}) {
  const [state, formAction, pending] = useActionState<PostFormState, FormData>(
    addAppCommentAction.bind(null, publicAppId, postId, parentCommentId),
    { error: null },
  );
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={formRef}
      action={async (fd) => {
        formAction(fd);
        formRef.current?.reset();
      }}
      className="mt-2 flex items-center gap-2"
    >
      <input
        name="body"
        required
        maxLength={300}
        placeholder={placeholder}
        className="w-full rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-900 outline-none placeholder:text-neutral-400"
      />
      <button type="submit" disabled={pending} aria-label="Send comment" className="text-neutral-400 hover:text-neutral-700">
        <Send size={15} />
      </button>
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}

function CommentRow({
  comment,
  publicAppId,
  accent,
  interactive,
  postId,
  isReply = false,
}: {
  comment: FeedComment;
  publicAppId: string;
  accent: string;
  interactive: boolean;
  postId: string;
  isReply?: boolean;
}) {
  const [replying, setReplying] = useState(false);
  return (
    <div className={isReply ? "ml-7 mt-1" : "mt-2"}>
      <div className="flex items-start gap-2">
        <Avatar name={comment.authorName} photoUrl={comment.authorAvatarUrl} accent={accent} size={22} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-neutral-700">
            {interactive ? (
              <a href={profileHref(publicAppId, comment.authorPersonId)} className="font-semibold hover:underline">
                {comment.authorName}
              </a>
            ) : (
              <span className="font-semibold">{comment.authorName}</span>
            )}{" "}
            {comment.body}
          </p>
          {interactive && !isReply && (
            <button
              type="button"
              onClick={() => setReplying((v) => !v)}
              className="mt-0.5 text-[10px] font-medium text-neutral-400 hover:text-neutral-700"
            >
              Reply
            </button>
          )}
        </div>
      </div>
      {comment.replies.map((reply) => (
        <CommentRow
          key={reply.id}
          comment={reply}
          publicAppId={publicAppId}
          accent={accent}
          interactive={interactive}
          postId={postId}
          isReply
        />
      ))}
      {replying && (
        <div className="ml-7">
          <CommentForm
            publicAppId={publicAppId}
            postId={postId}
            parentCommentId={comment.id}
            placeholder={`Reply to ${comment.authorName.split(" ")[0]}…`}
          />
        </div>
      )}
    </div>
  );
}

function ReactionBar({
  post,
  publicAppId,
  accent,
  interactive,
}: {
  post: FeedPost;
  publicAppId: string;
  accent: string;
  interactive: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [reacting, startReacting] = useTransition();

  const react = (emoji: string) => {
    setPickerOpen(false);
    if (interactive) startReacting(() => setAppReactionAction(publicAppId, post.id, emoji));
  };

  return (
    <div className="relative flex items-center gap-2">
      {post.reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          disabled={!interactive || reacting}
          onClick={() => react(r.emoji)}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
            post.myReaction === r.emoji ? "border-current bg-neutral-50 font-semibold" : "border-neutral-200"
          }`}
          style={post.myReaction === r.emoji ? { color: accent } : undefined}
          aria-label={`React ${r.emoji}`}
        >
          {r.emoji} {r.count}
        </button>
      ))}
      {interactive && (
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-label="Add a reaction"
          className="text-neutral-400 hover:text-neutral-700"
        >
          <SmilePlus size={15} />
        </button>
      )}
      {pickerOpen && (
        <div className="absolute bottom-6 left-0 z-10 flex gap-1 rounded-full border border-neutral-200 bg-white px-2 py-1 shadow-lg">
          {REACTION_EMOJIS_UI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => react(emoji)}
              className="rounded-full p-1 text-lg hover:bg-neutral-100"
              aria-label={`React ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PostCard({
  post,
  accent,
  churchName,
  publicAppId,
  interactive,
}: {
  post: FeedPost;
  accent: string;
  churchName: string;
  publicAppId: string;
  interactive: boolean;
}) {
  const [showComments, setShowComments] = useState(false);
  const isChurch = post.kind === "CHURCH";
  const authorName = isChurch ? churchName : post.authorName;

  return (
    <article className="rounded-xl border border-neutral-200 bg-white p-4">
      <header className="mb-2 flex items-center gap-2.5">
        <Avatar name={post.authorName} photoUrl={post.authorAvatarUrl} isChurch={isChurch} accent={accent} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-neutral-900">
            {interactive && !isChurch && post.authorPersonId ? (
              <a href={profileHref(publicAppId, post.authorPersonId)} className="hover:underline">
                {authorName}
              </a>
            ) : (
              authorName
            )}
          </p>
          <p className="text-xs text-neutral-500">
            {timeAgo(post.createdAt)}
            {post.groupName && ` · ${post.groupName}`}
            {isChurch && " · Announcement"}
          </p>
        </div>
      </header>

      {post.body && <p className="whitespace-pre-wrap text-sm text-neutral-800">{post.body}</p>}
      {post.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- member/staff-uploaded photo
        <img src={post.imageUrl} alt="" className="mt-2 max-h-80 w-full rounded-lg object-cover" />
      )}

      <footer className="mt-3 flex items-center gap-4 text-xs text-neutral-500">
        <ReactionBar post={post} publicAppId={publicAppId} accent={accent} interactive={interactive} />
        <button
          type="button"
          onClick={() => setShowComments((v) => !v)}
          className="inline-flex items-center gap-1.5"
          aria-label="Comments"
        >
          <MessageCircle size={15} />
          {post.commentCount > 0 && post.commentCount}
        </button>
      </footer>

      {(showComments || post.comments.length > 0) && (
        <div className="mt-3 border-t border-neutral-100 pt-1">
          {post.comments.map((comment) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              publicAppId={publicAppId}
              accent={accent}
              interactive={interactive}
              postId={post.id}
            />
          ))}
          {interactive && showComments && (
            <CommentForm publicAppId={publicAppId} postId={post.id} parentCommentId={null} placeholder="Write a comment…" />
          )}
        </div>
      )}
    </article>
  );
}

export function AppFeed({
  publicAppId,
  churchName,
  accent,
  posts,
  member,
  allowMemberPosts,
  myGroups,
  pushPublicKey = null,
  previewMode = false,
  chromeless = false,
}: {
  publicAppId: string;
  churchName: string;
  accent: string;
  posts: FeedPost[];
  member: { personId: string; displayName: string } | null;
  allowMemberPosts: boolean;
  myGroups: { id: string; name: string }[];
  /** VAPID public key; null hides the notifications toggle. */
  pushPublicKey?: string | null;
  previewMode?: boolean;
  /** Posts only — no signed-in header, sign-in banner, or composer (profile pages). */
  chromeless?: boolean;
}) {
  const interactive = !previewMode && member !== null;

  return (
    <div className="flex flex-col gap-3">
      {chromeless ? null : member ? (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-neutral-500">
            Signed in as{" "}
            {previewMode ? (
              <span className="font-semibold text-neutral-700">{member.displayName}</span>
            ) : (
              <a href={profileHref(publicAppId, member.personId)} className="font-semibold text-neutral-700 hover:underline">
                {member.displayName}
              </a>
            )}
          </p>
          {!previewMode && (
            <span className="flex items-center gap-3">
              {pushPublicKey && <PushToggle publicAppId={publicAppId} vapidPublicKey={pushPublicKey} />}
              <button
                type="button"
                onClick={() => void signOutAppAction(publicAppId)}
                className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-700"
              >
                <LogOut size={12} /> Sign out
              </button>
            </span>
          )}
        </div>
      ) : (
        <a
          href={previewMode ? undefined : `/a/${publicAppId}/signin`}
          className="block rounded-xl border border-dashed border-neutral-300 bg-white p-3 text-center text-sm font-medium"
          style={{ color: accent }}
        >
          Sign in to post and see your church family&rsquo;s updates →
        </a>
      )}

      {member && allowMemberPosts && !previewMode && !chromeless && (
        <Composer publicAppId={publicAppId} groups={myGroups} accent={accent} />
      )}

      {posts.length === 0 ? (
        <p className="pt-6 text-center text-sm text-neutral-500">Nothing here yet — check back soon.</p>
      ) : (
        posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            accent={accent}
            churchName={churchName}
            publicAppId={publicAppId}
            interactive={interactive}
          />
        ))
      )}
    </div>
  );
}
