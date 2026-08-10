import type { HouseholdRole, MembershipStatus, PersonRelationshipType } from "@cms/database";

type BadgeTone = "success" | "warning" | "danger" | "neutral" | "info";

export const MEMBERSHIP_STATUS_OPTIONS: { value: MembershipStatus; label: string }[] = [
  { value: "VISITOR", label: "Visitor" },
  { value: "ATTENDER", label: "Attender" },
  { value: "MEMBER", label: "Member" },
  { value: "INACTIVE", label: "Inactive" },
];

export function membershipStatusLabel(status: MembershipStatus): string {
  return MEMBERSHIP_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

export function membershipStatusTone(status: MembershipStatus): BadgeTone {
  switch (status) {
    case "MEMBER":
      return "success";
    case "ATTENDER":
      return "info";
    case "INACTIVE":
      return "warning";
    case "VISITOR":
    default:
      return "neutral";
  }
}

export const RELATIONSHIP_TYPE_OPTIONS: { value: PersonRelationshipType; label: string }[] = [
  { value: "SPOUSE", label: "Spouse" },
  { value: "PARENT", label: "Parent" },
  { value: "CHILD", label: "Child" },
  { value: "SIBLING", label: "Sibling" },
  { value: "GUARDIAN", label: "Guardian" },
  { value: "OTHER", label: "Other" },
];

export function relationshipTypeLabel(type: PersonRelationshipType): string {
  return RELATIONSHIP_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

export const HOUSEHOLD_ROLE_OPTIONS: { value: HouseholdRole; label: string }[] = [
  { value: "ADULT", label: "Adult" },
  { value: "CHILD", label: "Child" },
  { value: "OTHER", label: "Other" },
];

export function householdRoleLabel(role: HouseholdRole | null): string {
  if (!role) return "";
  return HOUSEHOLD_ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role;
}
