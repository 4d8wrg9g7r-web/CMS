import { tenantDb } from "../client";

/**
 * Community feed service (docs/domain/app.md): the church app's dynamic home.
 * CHURCH posts are staff announcements; MEMBER posts come from signed-in
 * members. Visibility: signed-out viewers see church-wide CHURCH posts only;
 * signed-in members additionally see church-wide MEMBER posts and posts scoped
 * to groups THEY belong to. Moderation is a hiddenAt flag — hidden posts leave
 * the feed but are kept for accountability.
 */

const POST_MAX_CHARS = 1000;
const COMMENT_MAX_CHARS = 300;
const FEED_TAKE = 30;
const COMMENTS_SHOWN = 3;

function displayName(person: { firstName: string; lastName: string; preferredName: string | null } | null): string {
  if (!person) return "";
  return `${person.preferredName || person.firstName} ${person.lastName}`.trim();
}

async function memberGroupIds(organizationId: string, personId: string): Promise<string[]> {
  const memberships = await tenantDb.groupMembership.findMany({
    where: { organizationId, personId },
    select: { groupId: true },
  });
  return memberships.map((m) => m.groupId);
}

/** Reaction whitelist — church-appropriate, extendable without migration. */
export const REACTION_EMOJIS = ["❤️", "🙏", "🙌", "🎉"] as const;

export interface FeedComment {
  id: string;
  authorName: string;
  authorAvatarUrl: string | null;
  authorPersonId: string;
  body: string;
  replies: FeedComment[];
}

export interface FeedPost {
  id: string;
  kind: "CHURCH" | "MEMBER";
  authorName: string | null;
  authorAvatarUrl: string | null;
  authorPersonId: string | null;
  groupName: string | null;
  body: string;
  imageUrl: string | null;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  reactions: { emoji: string; count: number }[];
  myReaction: string | null;
  commentCount: number;
  comments: FeedComment[];
  mine: boolean;
}

const COMMENT_PERSON = { select: { id: true, firstName: true, lastName: true, preferredName: true, photoUrl: true } };

export async function listFeed(
  organizationId: string,
  viewerPersonId: string | null,
  opts: { authorPersonId?: string } = {},
): Promise<FeedPost[]> {
  const groupIds = viewerPersonId ? await memberGroupIds(organizationId, viewerPersonId) : [];
  const posts = await tenantDb.appPost.findMany({
    where: {
      organizationId,
      hiddenAt: null,
      ...(opts.authorPersonId ? { personId: opts.authorPersonId } : {}),
      ...(viewerPersonId
        ? { OR: [{ groupId: null }, { groupId: { in: groupIds } }] }
        : { kind: "CHURCH", groupId: null }),
    },
    orderBy: { createdAt: "desc" },
    take: FEED_TAKE,
    include: {
      person: COMMENT_PERSON,
      group: { select: { name: true } },
      likes: { select: { emoji: true, personId: true } },
      _count: { select: { comments: true } },
      comments: {
        where: { parentCommentId: null },
        orderBy: { createdAt: "desc" },
        take: COMMENTS_SHOWN,
        include: {
          person: COMMENT_PERSON,
          replies: { orderBy: { createdAt: "asc" }, take: 5, include: { person: COMMENT_PERSON } },
        },
      },
    },
  });

  const toComment = (c: {
    id: string;
    body: string;
    person: { id: string; firstName: string; lastName: string; preferredName: string | null; photoUrl: string | null };
  }): FeedComment => ({
    id: c.id,
    authorName: displayName(c.person),
    authorAvatarUrl: c.person.photoUrl,
    authorPersonId: c.person.id,
    body: c.body,
    replies: [],
  });

  return posts.map((post) => {
    const counts = new Map<string, number>();
    let myReaction: string | null = null;
    for (const like of post.likes) {
      counts.set(like.emoji, (counts.get(like.emoji) ?? 0) + 1);
      if (viewerPersonId && like.personId === viewerPersonId) myReaction = like.emoji;
    }
    return {
      id: post.id,
      kind: post.kind,
      authorName: post.person ? displayName(post.person) : null,
      authorAvatarUrl: post.person?.photoUrl ?? null,
      authorPersonId: post.person?.id ?? null,
      groupName: post.group?.name ?? null,
      body: post.body,
      imageUrl: post.imageUrl,
      createdAt: post.createdAt.toISOString(),
      likeCount: post.likes.length,
      likedByMe: myReaction !== null,
      reactions: [...counts.entries()].map(([emoji, count]) => ({ emoji, count })),
      myReaction,
      commentCount: post._count.comments,
      comments: [...post.comments].reverse().map((c) => ({
        ...toComment(c),
        replies: c.replies.map(toComment),
      })),
      mine: viewerPersonId !== null && post.personId === viewerPersonId,
    };
  });
}

function cleanBody(body: string, max: number, opts: { allowEmpty?: boolean } = {}): string {
  const cleaned = body.replace(/\s+/g, " ").trim();
  if (!cleaned && !opts.allowEmpty) throw new Error("Write something first.");
  if (cleaned.length > max) throw new Error(`Keep it under ${max} characters.`);
  return cleaned;
}

const IMAGE_URL = /^(https?:\/\/[^\s"'<>]+|\/[^\s"'<>]+)$/i;

/** Photo posts: image URL from OUR upload actions only; a post needs text or a photo. */
function cleanImageUrl(imageUrl: string | null | undefined): string | null {
  const url = imageUrl?.trim() || null;
  if (url && !IMAGE_URL.test(url)) throw new Error("The photo could not be attached — upload it again.");
  return url;
}

export async function createMemberPost(
  organizationId: string,
  personId: string,
  input: { body: string; groupId?: string | null; imageUrl?: string | null },
) {
  const imageUrl = cleanImageUrl(input.imageUrl);
  const body = cleanBody(input.body, POST_MAX_CHARS, { allowEmpty: imageUrl !== null });
  const groupId = input.groupId || null;
  if (groupId) {
    const membership = await tenantDb.groupMembership.findFirst({
      where: { organizationId, groupId, personId },
      select: { id: true },
    });
    if (!membership) throw new Error("You can only share with groups you belong to.");
  }
  return tenantDb.appPost.create({
    data: { organizationId, kind: "MEMBER", personId, groupId, body, imageUrl },
  });
}

export async function createChurchPost(
  organizationId: string,
  input: { body: string; imageUrl?: string | null },
) {
  const imageUrl = cleanImageUrl(input.imageUrl);
  const body = cleanBody(input.body, POST_MAX_CHARS, { allowEmpty: imageUrl !== null });
  return tenantDb.appPost.create({ data: { organizationId, kind: "CHURCH", body, imageUrl } });
}

/**
 * One reaction per person per post: same emoji toggles it off, a different
 * emoji replaces it. Returns the member's resulting reaction (null = none).
 */
export async function setReaction(
  organizationId: string,
  personId: string,
  postId: string,
  emoji: string,
): Promise<string | null> {
  if (!(REACTION_EMOJIS as readonly string[]).includes(emoji)) throw new Error("Unknown reaction.");
  const post = await tenantDb.appPost.findFirst({
    where: { id: postId, organizationId, hiddenAt: null },
    select: { id: true },
  });
  if (!post) throw new Error("That post is no longer available.");

  const existing = await tenantDb.appPostLike.findFirst({
    where: { organizationId, postId, personId },
    select: { id: true, emoji: true },
  });
  if (existing?.emoji === emoji) {
    await tenantDb.appPostLike.deleteMany({ where: { id: existing.id, organizationId } });
    return null;
  }
  if (existing) {
    await tenantDb.appPostLike.updateMany({ where: { id: existing.id, organizationId }, data: { emoji } });
    return emoji;
  }
  await tenantDb.appPostLike.create({ data: { organizationId, postId, personId, emoji } });
  return emoji;
}

export async function addComment(
  organizationId: string,
  personId: string,
  postId: string,
  body: string,
  opts: { parentCommentId?: string | null } = {},
) {
  const cleaned = cleanBody(body, COMMENT_MAX_CHARS);
  const post = await tenantDb.appPost.findFirst({
    where: { id: postId, organizationId, hiddenAt: null },
    select: { id: true },
  });
  if (!post) throw new Error("That post is no longer available.");

  const parentCommentId = opts.parentCommentId || null;
  if (parentCommentId) {
    // Single-level threading: the parent must be a top-level comment on this post.
    const parent = await tenantDb.appPostComment.findFirst({
      where: { id: parentCommentId, organizationId, postId, parentCommentId: null },
      select: { id: true },
    });
    if (!parent) throw new Error("That comment is no longer available.");
  }
  return tenantDb.appPostComment.create({ data: { organizationId, postId, personId, body: cleaned, parentCommentId } });
}

// -- Staff moderation --------------------------------------------------------------

export async function setPostHidden(organizationId: string, postId: string, hidden: boolean) {
  const result = await tenantDb.appPost.updateMany({
    where: { id: postId, organizationId },
    data: { hiddenAt: hidden ? new Date() : null },
  });
  return result.count > 0;
}

/** Everything, including hidden — the moderation view. */
export async function listAllPosts(organizationId: string, opts: { take?: number } = {}) {
  return tenantDb.appPost.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 100,
    include: {
      person: { select: { firstName: true, lastName: true, preferredName: true } },
      group: { select: { name: true } },
      _count: { select: { likes: true, comments: true } },
    },
  });
}
