"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  auditService,
  groupService,
  groupSpaceService,
  type GroupEnrollment,
  type GroupMembershipRole,
  type GroupType,
} from "@cms/database";
import { getCurrentOrganization, getCurrentUser } from "../../../lib/session";
import { requireGroups } from "../../../lib/groups-access";

/**
 * Groups server actions. Each resolves the org, enforces authorization via
 * requireGroups (BLUEPRINT §34), mutates through the tenant-scoped service, and records
 * an audit event (BLUEPRINT §47). Record-specific actions take ids as bound arguments.
 */

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optionalStr(formData: FormData, key: string): string | null {
  const v = str(formData, key);
  return v.length > 0 ? v : null;
}

function parseCapacity(raw: string): number | null {
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function requireOrg() {
  const organization = await getCurrentOrganization();
  if (!organization) throw new Error("No organization");
  return organization;
}

function readGroupInput(formData: FormData) {
  return {
    type: (str(formData, "type") || "SMALL_GROUP") as GroupType,
    description: optionalStr(formData, "description"),
    enrollment: (str(formData, "enrollment") || "OPEN") as GroupEnrollment,
    meetingSchedule: optionalStr(formData, "meetingSchedule"),
    meetingLocation: optionalStr(formData, "meetingLocation"),
    capacity: parseCapacity(str(formData, "capacity")),
    isPublished: str(formData, "isPublished") === "on",
    campusId: optionalStr(formData, "campusId"),
  };
}

export async function createGroupAction(formData: FormData) {
  const organization = await requireOrg();
  await requireGroups(organization.id, "group.manage");

  const name = str(formData, "name");
  if (!name) throw new Error("Group name is required.");

  const group = await groupService.createGroup(organization.id, { name, ...readGroupInput(formData) });

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "group.created",
    targetType: "Group",
    targetId: group.id,
    metadata: { name },
  });

  redirect(`/groups/${group.id}`);
}

export async function updateGroupAction(groupId: string, formData: FormData) {
  const organization = await requireOrg();
  await requireGroups(organization.id, "group.manage");

  const name = str(formData, "name");
  if (!name) throw new Error("Group name is required.");

  const updated = await groupService.updateGroup(organization.id, groupId, { name, ...readGroupInput(formData) });
  if (!updated) throw new Error("Group not found.");

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "group.updated",
    targetType: "Group",
    targetId: groupId,
  });

  revalidatePath(`/groups/${groupId}`);
}

export async function archiveGroupAction(groupId: string) {
  const organization = await requireOrg();
  await requireGroups(organization.id, "group.manage");
  await groupService.archiveGroup(organization.id, groupId);

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "group.archived",
    targetType: "Group",
    targetId: groupId,
  });

  revalidatePath(`/groups/${groupId}`);
  revalidatePath("/groups");
}

export async function restoreGroupAction(groupId: string) {
  const organization = await requireOrg();
  await requireGroups(organization.id, "group.manage");
  await groupService.restoreGroup(organization.id, groupId);

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "group.restored",
    targetType: "Group",
    targetId: groupId,
  });

  revalidatePath(`/groups/${groupId}`);
  revalidatePath("/groups");
}

export async function addGroupMemberAction(groupId: string, formData: FormData) {
  const organization = await requireOrg();
  await requireGroups(organization.id, "group.manage");

  const personId = str(formData, "personId");
  const role = (str(formData, "role") || "MEMBER") as GroupMembershipRole;
  if (!personId) throw new Error("Choose a person to add.");

  const result = await groupService.addMember(organization.id, groupId, personId, role);
  if (!result.ok) {
    const message = {
      not_found: "That person or group could not be found.",
      at_capacity: "This group is at capacity.",
      already_member: "That person is already in this group.",
    }[result.reason];
    throw new Error(message);
  }

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "group.member_added",
    targetType: "Group",
    targetId: groupId,
    metadata: { personId, role },
  });

  revalidatePath(`/groups/${groupId}`);
}

export async function updateGroupMemberRoleAction(groupId: string, personId: string, formData: FormData) {
  const organization = await requireOrg();
  await requireGroups(organization.id, "group.manage");
  const role = (str(formData, "role") || "MEMBER") as GroupMembershipRole;
  await groupService.updateMemberRole(organization.id, groupId, personId, role);

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "group.member_role_updated",
    targetType: "Group",
    targetId: groupId,
    metadata: { personId, role },
  });

  revalidatePath(`/groups/${groupId}`);
}

/* ---------------------------------------------------------------- *
 * Group space (docs/domain/groups.md): staff-side stream, events,
 * polls, and moderation over the same payload the app renders.
 * ---------------------------------------------------------------- */

export async function postToGroupAsChurchAction(groupId: string, formData: FormData) {
  const organization = await requireOrg();
  await requireGroups(organization.id, "group.manage");
  const body = str(formData, "body");
  if (!body) throw new Error("Write a message first.");

  const actor = await getCurrentUser();
  const post = await groupSpaceService.createGroupPost(organization.id, groupId, {
    kind: "MESSAGE",
    body,
    authorUserId: actor?.id ?? null,
  });

  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "group.post_created",
    targetType: "Group",
    targetId: groupId,
    metadata: { postId: post.id },
  });

  revalidatePath(`/groups/${groupId}`);
}

export async function moderateGroupPostAction(groupId: string, postId: string, hidden: boolean) {
  const organization = await requireOrg();
  await requireGroups(organization.id, "group.manage");
  await groupSpaceService.setGroupPostHidden(organization.id, postId, hidden);

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: hidden ? "group.post_hidden" : "group.post_restored",
    targetType: "Group",
    targetId: groupId,
    metadata: { postId },
  });

  revalidatePath(`/groups/${groupId}`);
}

export async function createGroupEventStaffAction(groupId: string, formData: FormData) {
  const organization = await requireOrg();
  await requireGroups(organization.id, "group.manage");

  const title = str(formData, "title");
  const startAtRaw = str(formData, "startAt");
  if (!title) throw new Error("Event title is required.");
  const startAt = new Date(startAtRaw);
  if (!startAtRaw || Number.isNaN(startAt.getTime())) throw new Error("Pick a valid start time.");

  const event = await groupSpaceService.createGroupEvent(organization.id, groupId, {
    title,
    description: optionalStr(formData, "description"),
    location: optionalStr(formData, "location"),
    startAt,
    createdByPersonId: null,
  });

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "group.event_created",
    targetType: "Group",
    targetId: groupId,
    metadata: { eventId: event.id, title },
  });

  revalidatePath(`/groups/${groupId}`);
}

export async function archiveGroupEventStaffAction(groupId: string, eventId: string) {
  const organization = await requireOrg();
  await requireGroups(organization.id, "group.manage");
  await groupSpaceService.archiveGroupEvent(organization.id, eventId);

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "group.event_archived",
    targetType: "Group",
    targetId: groupId,
    metadata: { eventId },
  });

  revalidatePath(`/groups/${groupId}`);
}

/**
 * Attendance form: a hidden `personIds` roster plus one `attended:<personId>`
 * checkbox per row — unchecked boxes don't submit, so the roster tells us who
 * to mark absent.
 */
export async function markGroupAttendanceStaffAction(groupId: string, eventId: string, formData: FormData) {
  const organization = await requireOrg();
  await requireGroups(organization.id, "group.manage");

  const roster = str(formData, "personIds").split(",").filter(Boolean);
  const entries = roster.map((personId) => ({
    personId,
    attended: formData.get(`attended:${personId}`) === "on",
  }));
  await groupSpaceService.markAttendance(organization.id, eventId, entries);

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "group.attendance_marked",
    targetType: "Group",
    targetId: groupId,
    metadata: { eventId, present: entries.filter((e) => e.attended).length, total: entries.length },
  });

  revalidatePath(`/groups/${groupId}`);
}

export async function createGroupPollStaffAction(groupId: string, formData: FormData) {
  const organization = await requireOrg();
  await requireGroups(organization.id, "group.manage");

  const question = str(formData, "question");
  const options = str(formData, "options")
    .split("\n")
    .map((o) => o.trim())
    .filter(Boolean);

  const poll = await groupSpaceService.createGroupPoll(organization.id, groupId, {
    question,
    options,
    createdByPersonId: null,
  });

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "group.poll_created",
    targetType: "Group",
    targetId: groupId,
    metadata: { pollId: poll.id, question },
  });

  revalidatePath(`/groups/${groupId}`);
}

export async function closeGroupPollStaffAction(groupId: string, pollId: string) {
  const organization = await requireOrg();
  await requireGroups(organization.id, "group.manage");
  await groupSpaceService.closeGroupPoll(organization.id, pollId);

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "group.poll_closed",
    targetType: "Group",
    targetId: groupId,
    metadata: { pollId },
  });

  revalidatePath(`/groups/${groupId}`);
}

export async function removeGroupMemberAction(groupId: string, personId: string) {
  const organization = await requireOrg();
  await requireGroups(organization.id, "group.manage");
  await groupService.removeMember(organization.id, groupId, personId);

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "group.member_removed",
    targetType: "Group",
    targetId: groupId,
    metadata: { personId },
  });

  revalidatePath(`/groups/${groupId}`);
}
