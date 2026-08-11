import { GroupMembershipRole, GroupPostKind, GroupRsvpStatus, MembershipStatus, Prisma } from "@prisma/client";
import { tenantDb } from "../client";
import { createEmailBlast } from "./message-service";

/**
 * Group space (docs/domain/groups.md): the small-group home — chat, links,
 * prayer requests, group-only events with RSVP + attendance, polls, and leader
 * tools. Authorization model:
 *   - VIEW/POST: group members (GroupMembership), via the app's member session.
 *   - LEAD: LEADER/CO_LEADER memberships — events, polls, moderation, member
 *     management, attendance, email.
 *   - Dashboard staff reach the same operations through their own permission
 *     checks (group.manage) with actAsStaff.
 * Every function takes organizationId first and stays tenant-scoped.
 */

const BODY_MAX = 2000;
const HTTP_URL = /^https?:\/\/[^\s"'<>]+$/i;
const STREAM_TAKE = 50;
export const MAX_POLL_OPTIONS = 10;

// -- Gates -------------------------------------------------------------------------

export async function getMembership(organizationId: string, groupId: string, personId: string) {
  return tenantDb.groupMembership.findFirst({
    where: { organizationId, groupId, personId, group: { archivedAt: null } },
    select: { id: true, role: true },
  });
}

export async function requireMember(organizationId: string, groupId: string, personId: string) {
  const membership = await getMembership(organizationId, groupId, personId);
  if (!membership) throw new Error("You're not in this group.");
  return membership;
}

export async function requireLeader(organizationId: string, groupId: string, personId: string) {
  const membership = await requireMember(organizationId, groupId, personId);
  if (membership.role === GroupMembershipRole.MEMBER) throw new Error("Only group leaders can do that.");
  return membership;
}

export function isLeaderRole(role: GroupMembershipRole): boolean {
  return role !== GroupMembershipRole.MEMBER;
}

// -- Stream (chat / links / prayer) -------------------------------------------------

function cleanBody(body: string, opts: { allowEmpty?: boolean } = {}): string {
  const cleaned = body.replace(/\s+/g, " ").trim();
  if (!cleaned && !opts.allowEmpty) throw new Error("Write something first.");
  if (cleaned.length > BODY_MAX) throw new Error(`Keep it under ${BODY_MAX} characters.`);
  return cleaned;
}

export interface CreateGroupPostInput {
  kind: "MESSAGE" | "LINK" | "PRAYER";
  body: string;
  url?: string | null;
  anonymous?: boolean;
  /** Exactly one author: a member person or a staff user (dashboard). */
  personId?: string | null;
  authorUserId?: string | null;
}

export async function createGroupPost(organizationId: string, groupId: string, input: CreateGroupPostInput) {
  const kind = input.kind;
  let url: string | null = null;
  if (kind === "LINK") {
    url = input.url?.trim() || null;
    if (!url || !HTTP_URL.test(url)) throw new Error("Links need an http(s) URL.");
  }
  const body = cleanBody(input.body, { allowEmpty: kind === "LINK" });
  return tenantDb.groupPost.create({
    data: {
      organizationId,
      groupId,
      kind: kind as GroupPostKind,
      body,
      url,
      anonymous: kind === "PRAYER" ? Boolean(input.anonymous) : false,
      personId: input.personId ?? null,
      authorUserId: input.authorUserId ?? null,
    },
    // Author name rides along so callers can build push copy without a re-fetch.
    include: { person: { select: { firstName: true, lastName: true, preferredName: true } } },
  });
}

/** Minimal post lookup for notifications (e.g. "someone is praying"). */
export async function getGroupPost(organizationId: string, postId: string) {
  return tenantDb.groupPost.findFirst({
    where: { id: postId, organizationId },
    select: { id: true, groupId: true, kind: true, personId: true, anonymous: true, hiddenAt: true },
  });
}

/** Toggle "I'm praying" on a PRAYER post. Returns the new praying state. */
export async function togglePraying(organizationId: string, postId: string, personId: string): Promise<boolean> {
  const post = await tenantDb.groupPost.findFirst({
    where: { id: postId, organizationId, kind: GroupPostKind.PRAYER, hiddenAt: null },
    select: { id: true },
  });
  if (!post) throw new Error("That prayer request is no longer available.");
  const existing = await tenantDb.groupPostPrayer.findFirst({
    where: { organizationId, postId, personId },
    select: { id: true },
  });
  if (existing) {
    await tenantDb.groupPostPrayer.deleteMany({ where: { id: existing.id, organizationId } });
    return false;
  }
  await tenantDb.groupPostPrayer.create({ data: { organizationId, postId, personId } });
  return true;
}

export async function setGroupPostHidden(organizationId: string, postId: string, hidden: boolean) {
  const result = await tenantDb.groupPost.updateMany({
    where: { id: postId, organizationId },
    data: { hiddenAt: hidden ? new Date() : null },
  });
  return result.count > 0;
}

// -- Events -----------------------------------------------------------------------

export interface GroupEventInput {
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: Date;
  endAt?: Date | null;
  createdByPersonId?: string | null;
}

export async function createGroupEvent(organizationId: string, groupId: string, input: GroupEventInput) {
  const title = input.title.trim();
  if (!title) throw new Error("The event needs a title.");
  if (Number.isNaN(input.startAt.getTime())) throw new Error("Pick a valid date and time.");
  return tenantDb.groupEvent.create({
    data: {
      organizationId,
      groupId,
      title,
      description: input.description?.trim() || null,
      location: input.location?.trim() || null,
      startAt: input.startAt,
      endAt: input.endAt ?? null,
      createdByPersonId: input.createdByPersonId ?? null,
    },
  });
}

export async function archiveGroupEvent(organizationId: string, groupEventId: string) {
  const result = await tenantDb.groupEvent.updateMany({
    where: { id: groupEventId, organizationId },
    data: { archivedAt: new Date() },
  });
  return result.count > 0;
}

export async function setRsvp(organizationId: string, groupEventId: string, personId: string, status: string) {
  if (!Object.values(GroupRsvpStatus).includes(status as GroupRsvpStatus)) throw new Error("Unknown RSVP.");
  const event = await tenantDb.groupEvent.findFirst({
    where: { id: groupEventId, organizationId, archivedAt: null },
    select: { id: true },
  });
  if (!event) throw new Error("That event is no longer available.");
  const existing = await tenantDb.groupEventRsvp.findFirst({
    where: { organizationId, groupEventId, personId },
    select: { id: true },
  });
  if (existing) {
    await tenantDb.groupEventRsvp.updateMany({
      where: { id: existing.id, organizationId },
      data: { status: status as GroupRsvpStatus },
    });
  } else {
    await tenantDb.groupEventRsvp.create({
      data: { organizationId, groupEventId, personId, status: status as GroupRsvpStatus },
    });
  }
}

/** Leader attendance sheet: mark each person present/absent for an event. */
export async function markAttendance(
  organizationId: string,
  groupEventId: string,
  entries: { personId: string; attended: boolean }[],
) {
  const event = await tenantDb.groupEvent.findFirst({
    where: { id: groupEventId, organizationId },
    select: { id: true },
  });
  if (!event) throw new Error("Event not found.");
  for (const entry of entries) {
    const existing = await tenantDb.groupEventRsvp.findFirst({
      where: { organizationId, groupEventId, personId: entry.personId },
      select: { id: true },
    });
    if (existing) {
      await tenantDb.groupEventRsvp.updateMany({
        where: { id: existing.id, organizationId },
        data: { attended: entry.attended },
      });
    } else {
      await tenantDb.groupEventRsvp.create({
        data: {
          organizationId,
          groupEventId,
          personId: entry.personId,
          status: GroupRsvpStatus.NO,
          attended: entry.attended,
        },
      });
    }
  }
}

// -- Polls ------------------------------------------------------------------------

export async function createGroupPoll(
  organizationId: string,
  groupId: string,
  input: { question: string; options: string[]; createdByPersonId?: string | null },
) {
  const question = input.question.trim();
  if (!question) throw new Error("The poll needs a question.");
  const options = input.options.map((o) => o.trim()).filter(Boolean);
  if (options.length < 2) throw new Error("Give the poll at least two options.");
  if (options.length > MAX_POLL_OPTIONS) throw new Error(`At most ${MAX_POLL_OPTIONS} options.`);
  return tenantDb.groupPoll.create({
    data: {
      organizationId,
      groupId,
      question,
      options: options as unknown as Prisma.InputJsonValue,
      createdByPersonId: input.createdByPersonId ?? null,
    },
  });
}

export async function votePoll(organizationId: string, pollId: string, personId: string, optionIndex: number) {
  const poll = await tenantDb.groupPoll.findFirst({
    where: { id: pollId, organizationId, closedAt: null },
    select: { id: true, options: true },
  });
  if (!poll) throw new Error("That poll is closed.");
  const count = Array.isArray(poll.options) ? poll.options.length : 0;
  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= count) throw new Error("Unknown option.");
  const existing = await tenantDb.groupPollVote.findFirst({
    where: { organizationId, pollId, personId },
    select: { id: true },
  });
  if (existing) {
    await tenantDb.groupPollVote.updateMany({ where: { id: existing.id, organizationId }, data: { optionIndex } });
  } else {
    await tenantDb.groupPollVote.create({ data: { organizationId, pollId, personId, optionIndex } });
  }
}

export async function closeGroupPoll(organizationId: string, pollId: string) {
  const result = await tenantDb.groupPoll.updateMany({
    where: { id: pollId, organizationId, closedAt: null },
    data: { closedAt: new Date() },
  });
  return result.count > 0;
}

// -- Members ----------------------------------------------------------------------

/**
 * Leader adds a member by email. Matches an existing Person; when none exists,
 * creates a lightweight VISITOR Person (invited people become real database
 * records — the canonical directory grows from real ministry activity).
 */
export async function addMemberByEmail(
  organizationId: string,
  groupId: string,
  input: { email: string; firstName?: string | null; lastName?: string | null },
): Promise<{ personId: string; created: boolean }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");

  let person = await tenantDb.person.findFirst({
    where: { organizationId, archivedAt: null, email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  let created = false;
  if (!person) {
    const firstName = input.firstName?.trim();
    const lastName = input.lastName?.trim();
    if (!firstName || !lastName) throw new Error("New people need a first and last name.");
    person = await tenantDb.person.create({
      data: { organizationId, firstName, lastName, email, membershipStatus: MembershipStatus.VISITOR },
      select: { id: true },
    });
    created = true;
  }

  const existing = await tenantDb.groupMembership.findFirst({
    where: { organizationId, groupId, personId: person.id },
    select: { id: true },
  });
  if (!existing) {
    await tenantDb.groupMembership.create({
      data: { organizationId, groupId, personId: person.id, role: GroupMembershipRole.MEMBER },
    });
  }
  return { personId: person.id, created };
}

export async function removeMember(organizationId: string, groupId: string, personId: string) {
  const result = await tenantDb.groupMembership.deleteMany({ where: { organizationId, groupId, personId } });
  return result.count > 0;
}

// -- Leader email ------------------------------------------------------------------

/** Email every group member through the blast pipeline (consent-checked, logged). */
export async function emailGroup(
  organizationId: string,
  groupId: string,
  input: { subject: string; body: string; createdByUserId?: string | null },
) {
  const subject = input.subject.trim();
  const body = cleanBody(input.body);
  if (!subject) throw new Error("The email needs a subject.");
  return createEmailBlast(organizationId, {
    subject,
    bodyMarkdown: body,
    audience: { kind: "group", groupId },
    attachments: [],
    createdByUserId: input.createdByUserId ?? null,
  });
}

// -- Space payload -----------------------------------------------------------------

const PERSON_SELECT = { select: { id: true, firstName: true, lastName: true, preferredName: true, photoUrl: true } };

function displayName(p: { firstName: string; lastName: string; preferredName: string | null } | null): string | null {
  return p ? `${p.preferredName || p.firstName} ${p.lastName}`.trim() : null;
}

export interface GroupSpace {
  group: { id: string; name: string; description: string | null; meetingSchedule: string | null; meetingLocation: string | null };
  viewer: { personId: string | null; isLeader: boolean };
  members: { personId: string; name: string; avatarUrl: string | null; role: string }[];
  stream: {
    id: string;
    kind: "MESSAGE" | "LINK" | "PRAYER";
    body: string;
    url: string | null;
    authorName: string | null;
    authorAvatarUrl: string | null;
    isStaff: boolean;
    anonymous: boolean;
    hidden: boolean;
    prayingCount: number;
    prayingByMe: boolean;
    createdAt: string;
  }[];
  events: {
    id: string;
    title: string;
    description: string | null;
    location: string | null;
    startAt: string;
    going: number;
    maybe: number;
    myRsvp: string | null;
    attendance: { personId: string; name: string; attended: boolean | null; rsvp: string }[];
  }[];
  polls: {
    id: string;
    question: string;
    options: string[];
    closed: boolean;
    totalVotes: number;
    counts: number[];
    myVote: number | null;
  }[];
}

/**
 * Everything the group interface renders, in one serializable payload.
 * viewerPersonId null = staff (dashboard): sees everything including hidden
 * posts and prayer authors (moderation needs authorship).
 */
export async function getGroupSpace(
  organizationId: string,
  groupId: string,
  viewerPersonId: string | null,
): Promise<GroupSpace | null> {
  const group = await tenantDb.group.findFirst({
    where: { id: groupId, organizationId, archivedAt: null },
    select: { id: true, name: true, description: true, meetingSchedule: true, meetingLocation: true },
  });
  if (!group) return null;

  const staffView = viewerPersonId === null;
  const viewerMembership = viewerPersonId ? await getMembership(organizationId, groupId, viewerPersonId) : null;
  if (!staffView && !viewerMembership) return null;

  const [memberships, posts, events, polls] = await Promise.all([
    tenantDb.groupMembership.findMany({
      where: { organizationId, groupId },
      include: { person: PERSON_SELECT },
      orderBy: { joinedAt: "asc" },
    }),
    tenantDb.groupPost.findMany({
      where: { organizationId, groupId, ...(staffView ? {} : { hiddenAt: null }) },
      orderBy: { createdAt: "desc" },
      take: STREAM_TAKE,
      include: { person: PERSON_SELECT, prayers: { select: { personId: true } } },
    }),
    tenantDb.groupEvent.findMany({
      where: { organizationId, groupId, archivedAt: null },
      orderBy: { startAt: "asc" },
      include: { rsvps: { include: { person: PERSON_SELECT } } },
    }),
    tenantDb.groupPoll.findMany({
      where: { organizationId, groupId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { votes: { select: { personId: true, optionIndex: true } } },
    }),
  ]);

  return {
    group,
    viewer: {
      personId: viewerPersonId,
      isLeader: staffView || (viewerMembership ? isLeaderRole(viewerMembership.role) : false),
    },
    members: memberships.map((m) => ({
      personId: m.person.id,
      name: displayName(m.person) ?? "",
      avatarUrl: m.person.photoUrl,
      role: m.role,
    })),
    stream: [...posts].reverse().map((post) => {
      const anonymize = post.anonymous && !staffView;
      return {
        id: post.id,
        kind: post.kind,
        body: post.body,
        url: post.url,
        authorName: post.personId ? (anonymize ? null : displayName(post.person)) : null,
        authorAvatarUrl: post.personId && !anonymize ? (post.person?.photoUrl ?? null) : null,
        isStaff: post.personId === null,
        anonymous: post.anonymous,
        hidden: post.hiddenAt !== null,
        prayingCount: post.prayers.length,
        prayingByMe: viewerPersonId ? post.prayers.some((p) => p.personId === viewerPersonId) : false,
        createdAt: post.createdAt.toISOString(),
      };
    }),
    events: events.map((event) => ({
      id: event.id,
      title: event.title,
      description: event.description,
      location: event.location,
      startAt: event.startAt.toISOString(),
      going: event.rsvps.filter((r) => r.status === "GOING").length,
      maybe: event.rsvps.filter((r) => r.status === "MAYBE").length,
      myRsvp: viewerPersonId ? (event.rsvps.find((r) => r.personId === viewerPersonId)?.status ?? null) : null,
      attendance: event.rsvps.map((r) => ({
        personId: r.personId,
        name: displayName(r.person) ?? "",
        attended: r.attended,
        rsvp: r.status,
      })),
    })),
    polls: polls.map((poll) => {
      const options = (Array.isArray(poll.options) ? poll.options : []) as string[];
      const counts = options.map((_, i) => poll.votes.filter((v) => v.optionIndex === i).length);
      return {
        id: poll.id,
        question: poll.question,
        options,
        closed: poll.closedAt !== null,
        totalVotes: poll.votes.length,
        counts,
        myVote: viewerPersonId ? (poll.votes.find((v) => v.personId === viewerPersonId)?.optionIndex ?? null) : null,
      };
    }),
  };
}
