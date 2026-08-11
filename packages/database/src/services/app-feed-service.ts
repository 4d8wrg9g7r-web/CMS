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

export interface FeedComment {
  id: string;
  authorName: string;
  body: string;
}

export interface FeedPost {
  id: string;
  kind: "CHURCH" | "MEMBER";
  authorName: string | null;
  groupName: string | null;
  body: string;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
  comments: FeedComment[];
  mine: boolean;
}

export async function listFeed(organizationId: string, viewerPersonId: string | null): Promise<FeedPost[]> {
  const groupIds = viewerPersonId ? await memberGroupIds(organizationId, viewerPersonId) : [];
  const posts = await tenantDb.appPost.findMany({
    where: {
      organizationId,
      hiddenAt: null,
      ...(viewerPersonId
        ? { OR: [{ groupId: null }, { groupId: { in: groupIds } }] }
        : { kind: "CHURCH", groupId: null }),
    },
    orderBy: { createdAt: "desc" },
    take: FEED_TAKE,
    include: {
      person: { select: { firstName: true, lastName: true, preferredName: true } },
      group: { select: { name: true } },
      _count: { select: { likes: true, comments: true } },
      comments: {
        orderBy: { createdAt: "desc" },
        take: COMMENTS_SHOWN,
        include: { person: { select: { firstName: true, lastName: true, preferredName: true } } },
      },
    },
  });

  const myLikes = viewerPersonId
    ? new Set(
        (
          await tenantDb.appPostLike.findMany({
            where: { organizationId, personId: viewerPersonId, postId: { in: posts.map((p) => p.id) } },
            select: { postId: true },
          })
        ).map((l) => l.postId),
      )
    : new Set<string>();

  return posts.map((post) => ({
    id: post.id,
    kind: post.kind,
    authorName: post.person ? displayName(post.person) : null,
    groupName: post.group?.name ?? null,
    body: post.body,
    createdAt: post.createdAt.toISOString(),
    likeCount: post._count.likes,
    likedByMe: myLikes.has(post.id),
    commentCount: post._count.comments,
    comments: [...post.comments].reverse().map((c) => ({ id: c.id, authorName: displayName(c.person), body: c.body })),
    mine: viewerPersonId !== null && post.personId === viewerPersonId,
  }));
}

function cleanBody(body: string, max: number): string {
  const cleaned = body.replace(/\s+/g, " ").trim();
  if (!cleaned) throw new Error("Write something first.");
  if (cleaned.length > max) throw new Error(`Keep it under ${max} characters.`);
  return cleaned;
}

export async function createMemberPost(
  organizationId: string,
  personId: string,
  input: { body: string; groupId?: string | null },
) {
  const body = cleanBody(input.body, POST_MAX_CHARS);
  const groupId = input.groupId || null;
  if (groupId) {
    const membership = await tenantDb.groupMembership.findFirst({
      where: { organizationId, groupId, personId },
      select: { id: true },
    });
    if (!membership) throw new Error("You can only share with groups you belong to.");
  }
  return tenantDb.appPost.create({
    data: { organizationId, kind: "MEMBER", personId, groupId, body },
  });
}

export async function createChurchPost(organizationId: string, input: { body: string }) {
  const body = cleanBody(input.body, POST_MAX_CHARS);
  return tenantDb.appPost.create({ data: { organizationId, kind: "CHURCH", body } });
}

/** Returns the new liked state. */
export async function toggleLike(organizationId: string, personId: string, postId: string): Promise<boolean> {
  const post = await tenantDb.appPost.findFirst({
    where: { id: postId, organizationId, hiddenAt: null },
    select: { id: true },
  });
  if (!post) throw new Error("That post is no longer available.");

  const existing = await tenantDb.appPostLike.findFirst({
    where: { organizationId, postId, personId },
    select: { id: true },
  });
  if (existing) {
    await tenantDb.appPostLike.deleteMany({ where: { id: existing.id, organizationId } });
    return false;
  }
  await tenantDb.appPostLike.create({ data: { organizationId, postId, personId } });
  return true;
}

export async function addComment(organizationId: string, personId: string, postId: string, body: string) {
  const cleaned = cleanBody(body, COMMENT_MAX_CHARS);
  const post = await tenantDb.appPost.findFirst({
    where: { id: postId, organizationId, hiddenAt: null },
    select: { id: true },
  });
  if (!post) throw new Error("That post is no longer available.");
  return tenantDb.appPostComment.create({ data: { organizationId, postId, personId, body: cleaned } });
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
