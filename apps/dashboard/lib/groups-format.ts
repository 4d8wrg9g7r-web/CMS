import type { GroupEnrollment, GroupMembershipRole, GroupType } from "@cms/database";

export const GROUP_TYPE_OPTIONS: { value: GroupType; label: string }[] = [
  { value: "SMALL_GROUP", label: "Small Group" },
  { value: "CLASS", label: "Class" },
  { value: "MINISTRY_TEAM", label: "Ministry Team" },
  { value: "SERVING_TEAM", label: "Serving Team" },
  { value: "OTHER", label: "Other" },
];

export function groupTypeLabel(type: GroupType): string {
  return GROUP_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

export const GROUP_ENROLLMENT_OPTIONS: { value: GroupEnrollment; label: string }[] = [
  { value: "OPEN", label: "Open — anyone can join" },
  { value: "REQUEST", label: "Request to join" },
  { value: "INVITE_ONLY", label: "Invite only" },
  { value: "CLOSED", label: "Closed" },
];

export function groupEnrollmentLabel(enrollment: GroupEnrollment): string {
  return GROUP_ENROLLMENT_OPTIONS.find((o) => o.value === enrollment)?.label ?? enrollment;
}

export const GROUP_ROLE_OPTIONS: { value: GroupMembershipRole; label: string }[] = [
  { value: "LEADER", label: "Leader" },
  { value: "CO_LEADER", label: "Co-leader" },
  { value: "MEMBER", label: "Member" },
];

export function groupRoleLabel(role: GroupMembershipRole): string {
  return GROUP_ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role;
}
