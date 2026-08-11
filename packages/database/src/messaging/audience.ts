import { MembershipStatus } from "@prisma/client";

/**
 * Pure audience model for email blasts (docs/domain/communications.md). An audience
 * arrives from the composer as untrusted JSON and is stored verbatim on the blast —
 * validateBlastAudience is the single gate before any recipient query runs.
 */

export type BlastAudience =
  | { kind: "all" }
  | {
      kind: "filter";
      membershipStatus: string | null;
      campusId: string | null;
      tag: string | null;
      customFieldKey: string | null;
      customFieldValue: string | null;
    }
  | { kind: "group"; groupId: string }
  | { kind: "people"; personIds: string[] };

/** Hand-picked audiences are bounded; bigger sends should use filters/groups. */
export const MAX_PICKED_PEOPLE = 500;

export type AudienceValidation = { ok: true; audience: BlastAudience } | { ok: false; error: string };

export function validateBlastAudience(input: unknown): AudienceValidation {
  const raw = input as { kind?: string } | null;
  if (!raw || typeof raw !== "object") return { ok: false, error: "Choose who this email goes to." };

  if (raw.kind === "all") return { ok: true, audience: { kind: "all" } };

  if (raw.kind === "filter") {
    const f = raw as {
      membershipStatus?: unknown;
      campusId?: unknown;
      tag?: unknown;
      customFieldKey?: unknown;
      customFieldValue?: unknown;
    };
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    const membershipStatus = str(f.membershipStatus);
    if (membershipStatus && !Object.values(MembershipStatus).includes(membershipStatus as MembershipStatus)) {
      return { ok: false, error: "Unknown membership status filter." };
    }
    const customFieldKey = str(f.customFieldKey);
    const customFieldValue = str(f.customFieldValue);
    if (customFieldKey && !customFieldValue) {
      return { ok: false, error: "Choose a value for the custom-field filter." };
    }
    return {
      ok: true,
      audience: {
        kind: "filter",
        membershipStatus,
        campusId: str(f.campusId),
        tag: str(f.tag),
        customFieldKey: customFieldValue ? customFieldKey : null,
        customFieldValue: customFieldKey ? customFieldValue : null,
      },
    };
  }

  if (raw.kind === "group") {
    const groupId = (raw as { groupId?: unknown }).groupId;
    if (typeof groupId !== "string" || !groupId.trim()) return { ok: false, error: "Choose a group." };
    return { ok: true, audience: { kind: "group", groupId: groupId.trim() } };
  }

  if (raw.kind === "people") {
    const ids = (raw as { personIds?: unknown }).personIds;
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "string" && id.trim())) {
      return { ok: false, error: "Pick at least one person." };
    }
    if (ids.length > MAX_PICKED_PEOPLE) {
      return { ok: false, error: `Hand-picked audiences are capped at ${MAX_PICKED_PEOPLE} people — use a filter or group instead.` };
    }
    return { ok: true, audience: { kind: "people", personIds: [...new Set(ids.map((id) => id.trim()))] } };
  }

  return { ok: false, error: "Choose who this email goes to." };
}

/** Human-readable audience label for lists/detail pages. */
export function describeAudience(
  audience: BlastAudience,
  names: { campusName?: string | null; groupName?: string | null } = {},
): string {
  switch (audience.kind) {
    case "all":
      return "Everyone with an email address";
    case "filter": {
      const parts = [
        audience.membershipStatus
          ? audience.membershipStatus.charAt(0) + audience.membershipStatus.slice(1).toLowerCase() + "s"
          : null,
        names.campusName ? `at ${names.campusName}` : null,
        audience.tag ? `tagged “${audience.tag}”` : null,
        audience.customFieldKey ? `where ${audience.customFieldKey} = ${audience.customFieldValue}` : null,
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(" ") : "Everyone with an email address";
    }
    case "group":
      return names.groupName ? `Group: ${names.groupName}` : "A group";
    case "people":
      return `${audience.personIds.length} hand-picked ${audience.personIds.length === 1 ? "person" : "people"}`;
  }
}
