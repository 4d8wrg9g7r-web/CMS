"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Church, Heart, LogOut, MessageCircle, Send } from "lucide-react";
import type { FeedPost } from "@cms/database";
import {
  addAppCommentAction,
  createAppPostAction,
  signOutAppAction,
  toggleAppLikeAction,
  type PostFormState,
} from "../../app/a/[publicAppId]/actions";

/**
 * The community feed (docs/domain/app.md) rendered inside the app's Home tab.
 * Interactive on the public app (composer, hearts, comments via server
 * actions); App Studio's preview renders the same cards through previewMode,
 * which disables every action so the phone frame never navigates the studio.
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

function Composer({ publicAppId, groups, accent }: { publicAppId: string; groups: { id: string; name: string }[]; accent: string }) {
  const [state, formAction, pending] = useActionState<PostFormState, FormData>(
    createAppPostAction.bind(null, publicAppId),
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
      className="rounded-xl border border-neutral-200 bg-white p-3"
    >
      <textarea
        name="body"
        rows={2}
        required
        maxLength={1000}
        placeholder="Share something with your church family…"
        className="w-full resize-none border-0 text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        {groups.length > 0 ? (
          <select name="groupId" className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-700">
            <option value="">Everyone</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        ) : (
          <span />
        )}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: accent }}
        >
          <Send size={13} /> Post
        </button>
      </div>
      {state.error && <p className="mt-2 text-xs text-red-600">{state.error}</p>}
    </form>
  );
}

function CommentForm({ publicAppId, postId }: { publicAppId: string; postId: string }) {
  const [state, formAction, pending] = useActionState<PostFormState, FormData>(
    addAppCommentAction.bind(null, publicAppId, postId),
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
        placeholder="Write a comment…"
        className="w-full rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-900 outline-none placeholder:text-neutral-400"
      />
      <button type="submit" disabled={pending} aria-label="Send comment" className="text-neutral-400 hover:text-neutral-700">
        <Send size={15} />
      </button>
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
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
  const [liking, startLiking] = useTransition();
  const [showComments, setShowComments] = useState(false);
  const isChurch = post.kind === "CHURCH";

  return (
    <article className="rounded-xl border border-neutral-200 bg-white p-4">
      <header className="mb-2 flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
          style={{ backgroundColor: isChurch ? accent : "#8a8985" }}
        >
          {isChurch ? <Church size={16} /> : (post.authorName ?? "?").charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-neutral-900">{isChurch ? churchName : post.authorName}</p>
          <p className="text-xs text-neutral-500">
            {timeAgo(post.createdAt)}
            {post.groupName && ` · ${post.groupName}`}
            {isChurch && " · Announcement"}
          </p>
        </div>
      </header>

      <p className="whitespace-pre-wrap text-sm text-neutral-800">{post.body}</p>

      <footer className="mt-3 flex items-center gap-4 text-xs text-neutral-500">
        <button
          type="button"
          disabled={!interactive || liking}
          onClick={() => {
            if (interactive) startLiking(() => toggleAppLikeAction(publicAppId, post.id));
          }}
          className="inline-flex items-center gap-1.5"
          style={post.likedByMe ? { color: accent } : undefined}
          aria-label={post.likedByMe ? "Unlike" : "Like"}
        >
          <Heart size={15} fill={post.likedByMe ? "currentColor" : "none"} />
          {post.likeCount > 0 && post.likeCount}
        </button>
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
        <div className="mt-3 border-t border-neutral-100 pt-2">
          {post.comments.map((comment) => (
            <p key={comment.id} className="mt-1 text-xs text-neutral-700">
              <span className="font-semibold">{comment.authorName}</span> {comment.body}
            </p>
          ))}
          {interactive && showComments && <CommentForm publicAppId={publicAppId} postId={post.id} />}
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
  previewMode = false,
}: {
  publicAppId: string;
  churchName: string;
  accent: string;
  posts: FeedPost[];
  member: { displayName: string } | null;
  allowMemberPosts: boolean;
  myGroups: { id: string; name: string }[];
  previewMode?: boolean;
}) {
  const interactive = !previewMode && member !== null;

  return (
    <div className="flex flex-col gap-3">
      {member ? (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-neutral-500">
            Signed in as <span className="font-semibold text-neutral-700">{member.displayName}</span>
          </p>
          {!previewMode && (
            <button
              type="button"
              onClick={() => void signOutAppAction(publicAppId)}
              className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-700"
            >
              <LogOut size={12} /> Sign out
            </button>
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

      {member && allowMemberPosts && !previewMode && (
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
