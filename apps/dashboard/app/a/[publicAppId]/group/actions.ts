"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { after } from "next/server";
import { appMemberService, appService, groupSpaceService, personDisplayName } from "@cms/database";
import { notifyGroupEvent, notifyGroupPoll, notifyGroupPost, notifyPraying } from "../../../../lib/group-push";
import { drainOutbox } from "../../../../lib/outbox-worker";

/**
 * PWA group-space actions (docs/domain/groups.md): cookie-session variants of
 * the Bearer API. Every action resolves the app, the member, and (where
 * required) their leader role before touching the group.
 */

async function ctx(publicAppId: string) {
  const app = await appService.resolvePublicApp(publicAppId);
  if (!app) throw new Error("This app is not available.");
  const token = (await cookies()).get(`app_session_${publicAppId}`)?.value ?? "";
  const member = await appMemberService.getSessionMember(app.organizationId, token);
  if (!member) throw new Error("Sign in first.");
  return { app, member };
}

const groupPath = (publicAppId: string, groupId: string) => `/a/${publicAppId}/group/${groupId}`;

type Result = { ok: boolean; error?: string };

async function run(publicAppId: string, groupId: string, fn: () => Promise<void>): Promise<Result> {
  try {
    await fn();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong" };
  }
  revalidatePath(groupPath(publicAppId, groupId));
  return { ok: true };
}

export async function postToGroupAction(
  publicAppId: string,
  groupId: string,
  input: { kind: "MESSAGE" | "LINK" | "PRAYER"; body: string; url?: string; anonymous?: boolean },
): Promise<Result> {
  return run(publicAppId, groupId, async () => {
    const { app, member } = await ctx(publicAppId);
    await groupSpaceService.requireMember(app.organizationId, groupId, member.personId);
    const post = await groupSpaceService.createGroupPost(app.organizationId, groupId, {
      ...input,
      personId: member.personId,
    });
    const orgId = app.organizationId;
    after(() =>
      notifyGroupPost(orgId, groupId, {
        kind: input.kind,
        body: post.body,
        anonymous: post.anonymous,
        authorPersonId: post.personId,
        authorName: post.person ? personDisplayName(post.person) : null,
      }),
    );
  });
}

export async function prayAction(publicAppId: string, groupId: string, postId: string): Promise<Result> {
  return run(publicAppId, groupId, async () => {
    const { app, member } = await ctx(publicAppId);
    await groupSpaceService.requireMember(app.organizationId, groupId, member.personId);
    const praying = await groupSpaceService.togglePraying(app.organizationId, postId, member.personId);
    const orgId = app.organizationId;
    const prayingPersonId = member.personId;
    if (praying) after(() => notifyPraying(orgId, postId, prayingPersonId));
  });
}

export async function hideGroupPostAction(
  publicAppId: string,
  groupId: string,
  postId: string,
  hidden: boolean,
): Promise<Result> {
  return run(publicAppId, groupId, async () => {
    const { app, member } = await ctx(publicAppId);
    await groupSpaceService.requireLeader(app.organizationId, groupId, member.personId);
    await groupSpaceService.setGroupPostHidden(app.organizationId, postId, hidden);
  });
}

export async function rsvpAction(publicAppId: string, groupId: string, eventId: string, status: string): Promise<Result> {
  return run(publicAppId, groupId, async () => {
    const { app, member } = await ctx(publicAppId);
    await groupSpaceService.requireMember(app.organizationId, groupId, member.personId);
    await groupSpaceService.setRsvp(app.organizationId, eventId, member.personId, status);
  });
}

export async function createGroupEventAction(
  publicAppId: string,
  groupId: string,
  input: { title: string; description?: string; location?: string; startAt: string },
): Promise<Result> {
  return run(publicAppId, groupId, async () => {
    const { app, member } = await ctx(publicAppId);
    await groupSpaceService.requireLeader(app.organizationId, groupId, member.personId);
    const event = await groupSpaceService.createGroupEvent(app.organizationId, groupId, {
      title: input.title,
      description: input.description ?? null,
      location: input.location ?? null,
      startAt: new Date(input.startAt),
      createdByPersonId: member.personId,
    });
    const orgId = app.organizationId;
    after(() => notifyGroupEvent(orgId, groupId, { title: event.title, createdByPersonId: event.createdByPersonId }));
  });
}

export async function markAttendanceAction(
  publicAppId: string,
  groupId: string,
  eventId: string,
  entries: { personId: string; attended: boolean }[],
): Promise<Result> {
  return run(publicAppId, groupId, async () => {
    const { app, member } = await ctx(publicAppId);
    await groupSpaceService.requireLeader(app.organizationId, groupId, member.personId);
    await groupSpaceService.markAttendance(app.organizationId, eventId, entries);
  });
}

export async function createGroupPollAction(
  publicAppId: string,
  groupId: string,
  input: { question: string; options: string[] },
): Promise<Result> {
  return run(publicAppId, groupId, async () => {
    const { app, member } = await ctx(publicAppId);
    await groupSpaceService.requireLeader(app.organizationId, groupId, member.personId);
    const poll = await groupSpaceService.createGroupPoll(app.organizationId, groupId, {
      ...input,
      createdByPersonId: member.personId,
    });
    const orgId = app.organizationId;
    after(() => notifyGroupPoll(orgId, groupId, { question: poll.question, createdByPersonId: poll.createdByPersonId }));
  });
}

export async function votePollAction(
  publicAppId: string,
  groupId: string,
  pollId: string,
  optionIndex: number,
): Promise<Result> {
  return run(publicAppId, groupId, async () => {
    const { app, member } = await ctx(publicAppId);
    await groupSpaceService.requireMember(app.organizationId, groupId, member.personId);
    await groupSpaceService.votePoll(app.organizationId, pollId, member.personId, optionIndex);
  });
}

export async function closePollAction(publicAppId: string, groupId: string, pollId: string): Promise<Result> {
  return run(publicAppId, groupId, async () => {
    const { app, member } = await ctx(publicAppId);
    await groupSpaceService.requireLeader(app.organizationId, groupId, member.personId);
    await groupSpaceService.closeGroupPoll(app.organizationId, pollId);
  });
}

export async function addGroupMemberAction(
  publicAppId: string,
  groupId: string,
  input: { email: string; firstName?: string; lastName?: string },
): Promise<Result> {
  return run(publicAppId, groupId, async () => {
    const { app, member } = await ctx(publicAppId);
    await groupSpaceService.requireLeader(app.organizationId, groupId, member.personId);
    await groupSpaceService.addMemberByEmail(app.organizationId, groupId, {
      email: input.email,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
    });
  });
}

export async function removeGroupMemberAction(publicAppId: string, groupId: string, personId: string): Promise<Result> {
  return run(publicAppId, groupId, async () => {
    const { app, member } = await ctx(publicAppId);
    await groupSpaceService.requireLeader(app.organizationId, groupId, member.personId);
    if (personId === member.personId) throw new Error("Leaders can't remove themselves.");
    await groupSpaceService.removeMember(app.organizationId, groupId, personId);
  });
}

export async function emailGroupAction(
  publicAppId: string,
  groupId: string,
  input: { subject: string; body: string },
): Promise<Result> {
  return run(publicAppId, groupId, async () => {
    const { app, member } = await ctx(publicAppId);
    await groupSpaceService.requireLeader(app.organizationId, groupId, member.personId);
    await groupSpaceService.emailGroup(app.organizationId, groupId, input);
    after(async () => {
      try {
        await drainOutbox();
      } catch (err) {
        console.error("Opportunistic outbox drain failed (cron will retry):", err);
      }
    });
  });
}
