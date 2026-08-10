"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import {
  auditService,
  peopleService,
  type HouseholdRole,
  type MembershipStatus,
  type PersonRelationshipType,
} from "@cms/database";
import { getCurrentOrganization, getCurrentUser } from "../../../lib/session";
import { requirePeople } from "../../../lib/people-access";
import { drainOutbox } from "../../../lib/outbox-worker";

/**
 * People & Households server actions. Every action resolves the current organization,
 * enforces authorization server-side via requirePeople (BLUEPRINT §34), performs the
 * mutation through the tenant-scoped service layer, and records an audit event
 * (BLUEPRINT §47). Actions that target a specific record take its id as a bound first
 * argument (see `.bind(null, id)` at the call sites).
 */

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optionalStr(formData: FormData, key: string): string | null {
  const v = str(formData, key);
  return v.length > 0 ? v : null;
}

function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function parseBirthdate(raw: string): Date | null {
  if (!raw) return null;
  // <input type="date"> yields YYYY-MM-DD; pin to UTC midnight so a birthdate never
  // drifts a day across timezones.
  const date = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function requireOrg() {
  const organization = await getCurrentOrganization();
  if (!organization) throw new Error("No organization");
  return organization;
}

export async function createPersonAction(formData: FormData) {
  const organization = await requireOrg();
  await requirePeople(organization.id, "person.manage");

  const firstName = str(formData, "firstName");
  const lastName = str(formData, "lastName");
  if (!firstName || !lastName) throw new Error("First and last name are required.");

  const person = await peopleService.createPerson(organization.id, {
    firstName,
    lastName,
    preferredName: optionalStr(formData, "preferredName"),
    email: optionalStr(formData, "email"),
    phone: optionalStr(formData, "phone"),
    membershipStatus: (str(formData, "membershipStatus") || "VISITOR") as MembershipStatus,
    birthdate: parseBirthdate(str(formData, "birthdate")),
    tags: parseTags(str(formData, "tags")),
    notes: optionalStr(formData, "notes"),
    campusId: optionalStr(formData, "campusId"),
  });

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "person.created",
    targetType: "Person",
    targetId: person.id,
    metadata: { name: `${firstName} ${lastName}` },
  });

  // Low-latency drain of the PersonCreated outbox event (workflow triggers); the cron
  // route remains the durable backstop.
  after(async () => {
    try {
      await drainOutbox();
    } catch (err) {
      console.error("Opportunistic outbox drain failed (cron will retry):", err);
    }
  });

  redirect(`/people/${person.id}`);
}

export async function updatePersonAction(personId: string, formData: FormData) {
  const organization = await requireOrg();
  await requirePeople(organization.id, "person.manage");

  const firstName = str(formData, "firstName");
  const lastName = str(formData, "lastName");
  if (!firstName || !lastName) throw new Error("First and last name are required.");

  const updated = await peopleService.updatePerson(organization.id, personId, {
    firstName,
    lastName,
    preferredName: optionalStr(formData, "preferredName"),
    email: optionalStr(formData, "email"),
    phone: optionalStr(formData, "phone"),
    membershipStatus: (str(formData, "membershipStatus") || "VISITOR") as MembershipStatus,
    birthdate: parseBirthdate(str(formData, "birthdate")),
    tags: parseTags(str(formData, "tags")),
    notes: optionalStr(formData, "notes"),
    campusId: optionalStr(formData, "campusId"),
  });
  if (!updated) throw new Error("Person not found.");

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "person.updated",
    targetType: "Person",
    targetId: personId,
  });

  revalidatePath(`/people/${personId}`);
}

export async function setEmailOptOutAction(personId: string, optedOut: boolean) {
  const organization = await requireOrg();
  await requirePeople(organization.id, "person.manage");

  await peopleService.setEmailOptOut(organization.id, personId, optedOut);

  // Consent changes are always audited (BLUEPRINT §19/§49).
  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: optedOut ? "person.email_opt_out_set" : "person.email_opt_out_cleared",
    targetType: "Person",
    targetId: personId,
  });

  revalidatePath(`/people/${personId}`);
}

export async function archivePersonAction(personId: string) {
  const organization = await requireOrg();
  await requirePeople(organization.id, "person.manage");

  await peopleService.archivePerson(organization.id, personId);

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "person.archived",
    targetType: "Person",
    targetId: personId,
  });

  revalidatePath(`/people/${personId}`);
  revalidatePath("/people");
}

export async function restorePersonAction(personId: string) {
  const organization = await requireOrg();
  await requirePeople(organization.id, "person.manage");

  await peopleService.restorePerson(organization.id, personId);

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "person.restored",
    targetType: "Person",
    targetId: personId,
  });

  revalidatePath(`/people/${personId}`);
  revalidatePath("/people");
}

export async function setHouseholdAction(personId: string, formData: FormData) {
  const organization = await requireOrg();
  await requirePeople(organization.id, "household.manage");

  const role = (str(formData, "householdRole") || "ADULT") as HouseholdRole;
  const newHouseholdName = str(formData, "newHouseholdName");
  let householdId: string | null = optionalStr(formData, "householdId");

  if (newHouseholdName) {
    const household = await peopleService.createHousehold(organization.id, { name: newHouseholdName });
    householdId = household.id;
    const actor = await getCurrentUser();
    await auditService.recordAuditEvent({
      organizationId: organization.id,
      actorUserId: actor?.id,
      action: "household.created",
      targetType: "Household",
      targetId: household.id,
      metadata: { name: newHouseholdName },
    });
  }

  await peopleService.setHousehold(organization.id, personId, householdId, householdId ? role : null);

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: householdId ? "person.household_assigned" : "person.household_removed",
    targetType: "Person",
    targetId: personId,
    metadata: householdId ? { householdId, role } : undefined,
  });

  revalidatePath(`/people/${personId}`);
}

export async function addRelationshipAction(personId: string, formData: FormData) {
  const organization = await requireOrg();
  await requirePeople(organization.id, "person.manage");

  const relatedPersonId = str(formData, "relatedPersonId");
  const type = str(formData, "type") as PersonRelationshipType;
  if (!relatedPersonId || !type) throw new Error("Choose a person and a relationship type.");

  await peopleService.addRelationship(organization.id, personId, relatedPersonId, type);

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "person.relationship_added",
    targetType: "Person",
    targetId: personId,
    metadata: { relatedPersonId, type },
  });

  revalidatePath(`/people/${personId}`);
}

export async function removeRelationshipAction(
  personId: string,
  relatedPersonId: string,
  type: PersonRelationshipType,
) {
  const organization = await requireOrg();
  await requirePeople(organization.id, "person.manage");

  await peopleService.removeRelationship(organization.id, personId, relatedPersonId, type);

  const actor = await getCurrentUser();
  await auditService.recordAuditEvent({
    organizationId: organization.id,
    actorUserId: actor?.id,
    action: "person.relationship_removed",
    targetType: "Person",
    targetId: personId,
    metadata: { relatedPersonId, type },
  });

  revalidatePath(`/people/${personId}`);
}
