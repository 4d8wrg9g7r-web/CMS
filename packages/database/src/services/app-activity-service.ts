import { tenantDb } from "../client";

/**
 * A person's church-app engagement, assembled for the dashboard person profile
 * (docs/domain/app.md, docs/domain/groups.md "Profile sync").
 *
 * STAFF-ONLY BY DESIGN: this is never exposed through the app's member API
 * (/api/app/v1/**) — members can only ever read their own session via /me and
 * the feeds/spaces they belong to. The sole caller is the dashboard person
 * page, which sits behind staff auth + the people-domain permission check.
 * Keep it that way: do not wire this service into any app-facing route.
 */

export type AppActivityKind =
  | "feed_post"
  | "feed_comment"
  | "feed_reaction"
  | "group_post"
  | "group_rsvp"
  | "poll_vote";

export interface AppActivityItem {
  kind: AppActivityKind;
  /** What happened, e.g. "Posted in the community feed". */
  label: string;
  /** Body excerpt, event title, chosen option… may be empty. */
  detail: string;
  /** Group name for group-scoped items, null for church-wide feed items. */
  groupName: string | null;
  at: Date;
}

export interface PersonAppActivity {
  /** Most recent app sign-in session (creation time), null = never signed in. */
  lastSignInAt: Date | null;
  /** Person has at least one push subscription (web or native). */
  pushEnabled: boolean;
  counts: {
    feedPosts: number;
    feedComments: number;
    feedReactions: number;
    groupPosts: number;
    rsvps: number;
    pollVotes: number;
  };
  /** Merged, newest-first (bounded). */
  timeline: AppActivityItem[];
}

const PER_SOURCE_TAKE = 10;
const TIMELINE_TAKE = 15;
const EXCERPT_MAX = 120;

export function excerpt(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > EXCERPT_MAX ? `${cleaned.slice(0, EXCERPT_MAX - 1)}…` : cleaned;
}

/** Merge per-source items into one bounded newest-first timeline. Pure — unit tested. */
export function mergeTimeline(sources: AppActivityItem[][], take = TIMELINE_TAKE): AppActivityItem[] {
  return sources
    .flat()
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, take);
}

const RSVP_LABEL: Record<string, string> = {
  GOING: "RSVP'd going",
  MAYBE: "RSVP'd maybe",
  NO: "RSVP'd can't make it",
};

export async function getPersonAppActivity(organizationId: string, personId: string): Promise<PersonAppActivity> {
  const [
    lastSession,
    pushCount,
    feedPostCount,
    feedCommentCount,
    feedReactionCount,
    groupPostCount,
    rsvpCount,
    pollVoteCount,
    feedPosts,
    feedComments,
    feedReactions,
    groupPosts,
    rsvps,
    pollVotes,
  ] = await Promise.all([
    tenantDb.appSession.findFirst({
      where: { organizationId, personId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    tenantDb.appPushSubscription.count({ where: { organizationId, personId } }),
    tenantDb.appPost.count({ where: { organizationId, personId } }),
    tenantDb.appPostComment.count({ where: { organizationId, personId } }),
    tenantDb.appPostLike.count({ where: { organizationId, personId } }),
    tenantDb.groupPost.count({ where: { organizationId, personId } }),
    tenantDb.groupEventRsvp.count({ where: { organizationId, personId } }),
    tenantDb.groupPollVote.count({ where: { organizationId, personId } }),
    tenantDb.appPost.findMany({
      where: { organizationId, personId },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE_TAKE,
      select: { body: true, imageUrl: true, hiddenAt: true, createdAt: true, group: { select: { name: true } } },
    }),
    tenantDb.appPostComment.findMany({
      where: { organizationId, personId },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE_TAKE,
      select: { body: true, parentCommentId: true, createdAt: true },
    }),
    tenantDb.appPostLike.findMany({
      where: { organizationId, personId },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE_TAKE,
      select: { emoji: true, createdAt: true, post: { select: { body: true, kind: true } } },
    }),
    tenantDb.groupPost.findMany({
      where: { organizationId, personId },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE_TAKE,
      select: {
        kind: true,
        body: true,
        url: true,
        anonymous: true,
        hiddenAt: true,
        createdAt: true,
        group: { select: { name: true } },
      },
    }),
    tenantDb.groupEventRsvp.findMany({
      where: { organizationId, personId },
      orderBy: { updatedAt: "desc" },
      take: PER_SOURCE_TAKE,
      select: {
        status: true,
        attended: true,
        updatedAt: true,
        groupEvent: { select: { title: true, group: { select: { name: true } } } },
      },
    }),
    tenantDb.groupPollVote.findMany({
      where: { organizationId, personId },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE_TAKE,
      select: {
        optionIndex: true,
        createdAt: true,
        poll: { select: { question: true, options: true, group: { select: { name: true } } } },
      },
    }),
  ]);

  const timeline = mergeTimeline([
    feedPosts.map((p) => ({
      kind: "feed_post" as const,
      label: p.group
        ? "Posted to their group's feed"
        : p.imageUrl && !p.body
          ? "Shared a photo in the community feed"
          : "Posted in the community feed",
      detail: excerpt(p.body) + (p.hiddenAt ? " (hidden by staff)" : ""),
      groupName: p.group?.name ?? null,
      at: p.createdAt,
    })),
    feedComments.map((c) => ({
      kind: "feed_comment" as const,
      label: c.parentCommentId ? "Replied to a comment" : "Commented on a post",
      detail: excerpt(c.body),
      groupName: null,
      at: c.createdAt,
    })),
    feedReactions.map((r) => ({
      kind: "feed_reaction" as const,
      label: `Reacted ${r.emoji} to a post`,
      detail: excerpt(r.post.body),
      groupName: null,
      at: r.createdAt,
    })),
    groupPosts.map((p) => ({
      kind: "group_post" as const,
      // Anonymity is a member-facing promise; staff always see authorship
      // (same rule as the group space's staff view), but flag it so staff
      // treat it with care.
      label:
        p.kind === "PRAYER"
          ? `Shared a prayer request${p.anonymous ? " (anonymous to the group)" : ""}`
          : p.kind === "LINK"
            ? "Shared a link with their group"
            : "Posted in their group",
      detail: excerpt(p.body || p.url || "") + (p.hiddenAt ? " (hidden)" : ""),
      groupName: p.group.name,
      at: p.createdAt,
    })),
    rsvps.map((r) => ({
      kind: "group_rsvp" as const,
      label: r.attended === true ? "Attended a group event" : (RSVP_LABEL[r.status] ?? "RSVP'd"),
      detail: r.groupEvent.title,
      groupName: r.groupEvent.group.name,
      at: r.updatedAt,
    })),
    pollVotes.map((v) => {
      const options = (Array.isArray(v.poll.options) ? v.poll.options : []) as string[];
      return {
        kind: "poll_vote" as const,
        label: "Voted in a group poll",
        detail: `${excerpt(v.poll.question)} — ${options[v.optionIndex] ?? "…"}`,
        groupName: v.poll.group.name,
        at: v.createdAt,
      };
    }),
  ]);

  return {
    lastSignInAt: lastSession?.createdAt ?? null,
    pushEnabled: pushCount > 0,
    counts: {
      feedPosts: feedPostCount,
      feedComments: feedCommentCount,
      feedReactions: feedReactionCount,
      groupPosts: groupPostCount,
      rsvps: rsvpCount,
      pollVotes: pollVoteCount,
    },
    timeline,
  };
}
