import { appService, groupService, groupSpaceService, personDisplayName } from "@cms/database";
import { sendAppPushToPeople } from "./app-push";

/**
 * Push fan-out for group-space activity (docs/domain/groups.md): new posts,
 * events, and polls notify the group's members; a "praying" tap notifies the
 * request's author. Always targeted — never the whole org — and always
 * fire-and-forget: call these inside `after()` and they swallow their own
 * errors, so a push hiccup can never fail the member's action.
 *
 * Anonymity: pushes for anonymous prayer requests never carry the author's
 * name, matching what the group sees in the app.
 */

interface GroupNotifyTarget {
  groupName: string;
  url: string;
  memberPersonIds: string[];
}

/** Resolve app + group; null when the org has no enabled app (nothing to deep-link to). */
async function target(organizationId: string, groupId: string): Promise<GroupNotifyTarget | null> {
  const app = await appService.getChurchApp(organizationId);
  if (!app?.enabled) return null;
  const group = await groupService.getGroup(organizationId, groupId);
  if (!group || group.archivedAt) return null;
  return {
    groupName: group.name,
    url: `/a/${app.publicAppId}/group/${groupId}`,
    memberPersonIds: group.memberships.map((m) => m.personId),
  };
}

const trim = (text: string, max = 120) => {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
};

export interface GroupPostNotifyInput {
  kind: "MESSAGE" | "LINK" | "PRAYER";
  body: string;
  anonymous: boolean;
  /** Member author (excluded from recipients), or null for a staff post. */
  authorPersonId: string | null;
  /** Display name for the copy; null for staff posts (the church speaks). */
  authorName: string | null;
}

export async function notifyGroupPost(organizationId: string, groupId: string, post: GroupPostNotifyInput) {
  try {
    const t = await target(organizationId, groupId);
    if (!t) return;
    const recipients = t.memberPersonIds.filter((id) => id !== post.authorPersonId);
    const author = post.anonymous ? null : post.authorName;
    const body =
      post.kind === "PRAYER"
        ? `🙏 ${author ? `${author} shared a prayer request` : "New prayer request"}: ${trim(post.body)}`
        : post.kind === "LINK"
          ? `${author ?? "Your church"} shared a link${post.body ? `: ${trim(post.body)}` : ""}`
          : `${author ?? "Your church"}: ${trim(post.body)}`;
    await sendAppPushToPeople(organizationId, recipients, { title: t.groupName, body, url: t.url });
  } catch (err) {
    console.error("Group post push failed:", err);
  }
}

export async function notifyGroupEvent(
  organizationId: string,
  groupId: string,
  event: { title: string; createdByPersonId: string | null },
) {
  try {
    const t = await target(organizationId, groupId);
    if (!t) return;
    const recipients = t.memberPersonIds.filter((id) => id !== event.createdByPersonId);
    await sendAppPushToPeople(organizationId, recipients, {
      title: t.groupName,
      body: `📅 New event: ${trim(event.title, 100)} — RSVP in the app`,
      url: t.url,
    });
  } catch (err) {
    console.error("Group event push failed:", err);
  }
}

export async function notifyGroupPoll(
  organizationId: string,
  groupId: string,
  poll: { question: string; createdByPersonId: string | null },
) {
  try {
    const t = await target(organizationId, groupId);
    if (!t) return;
    const recipients = t.memberPersonIds.filter((id) => id !== poll.createdByPersonId);
    await sendAppPushToPeople(organizationId, recipients, {
      title: t.groupName,
      body: `🗳️ New poll: ${trim(poll.question, 100)}`,
      url: t.url,
    });
  } catch (err) {
    console.error("Group poll push failed:", err);
  }
}

/** Someone tapped "I'm praying" — tell the request's author (never who tapped). */
export async function notifyPraying(organizationId: string, postId: string, prayingPersonId: string) {
  try {
    const post = await groupSpaceService.getGroupPost(organizationId, postId);
    if (!post || post.kind !== "PRAYER" || post.hiddenAt || !post.personId) return;
    if (post.personId === prayingPersonId) return; // praying for your own request
    const t = await target(organizationId, post.groupId);
    if (!t) return;
    await sendAppPushToPeople(organizationId, [post.personId], {
      title: t.groupName,
      body: "🙏 Someone from your group is praying for your request.",
      url: t.url,
    });
  } catch (err) {
    console.error("Praying push failed:", err);
  }
}
