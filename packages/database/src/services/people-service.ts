import { HouseholdRole, MembershipStatus, Prisma, PersonRelationshipType } from "@prisma/client";
import { rawDb, tenantDb } from "../client";
import { inverseRelationshipType } from "../people/helpers";
import { emit } from "./outbox-service";

/**
 * People & Households service (BLUEPRINT §5). Every query is tenant-scoped: the
 * organizationId is always part of the where/data, which both the tenant guard and the
 * CI scoping check require. Soft archival (archivedAt) is used instead of deletion --
 * ministry records keep their history (BLUEPRINT §36). Audit events for these mutations
 * are recorded by the callers (server actions), matching the existing team-service
 * pattern.
 */

// -- People --------------------------------------------------------------------

export interface PersonInput {
  firstName: string;
  lastName: string;
  preferredName?: string | null;
  email?: string | null;
  phone?: string | null;
  membershipStatus?: MembershipStatus;
  birthdate?: Date | null;
  tags?: string[];
  notes?: string | null;
  householdId?: string | null;
  householdRole?: HouseholdRole | null;
  campusId?: string | null;
}

export interface ListPeopleOptions {
  search?: string;
  status?: MembershipStatus;
  householdId?: string;
  includeArchived?: boolean;
  skip?: number;
  take?: number;
}

function peopleWhere(organizationId: string, opts: ListPeopleOptions): Prisma.PersonWhereInput {
  const where: Prisma.PersonWhereInput = { organizationId };
  if (!opts.includeArchived) where.archivedAt = null;
  if (opts.status) where.membershipStatus = opts.status;
  if (opts.householdId) where.householdId = opts.householdId;
  const search = opts.search?.trim();
  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { preferredName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }
  return where;
}

export async function listPeople(organizationId: string, opts: ListPeopleOptions = {}) {
  return tenantDb.person.findMany({
    where: peopleWhere(organizationId, opts),
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    skip: opts.skip,
    take: opts.take,
    include: { household: { select: { id: true, name: true } } },
  });
}

export async function countPeople(organizationId: string, opts: ListPeopleOptions = {}) {
  return tenantDb.person.count({ where: peopleWhere(organizationId, opts) });
}

/** Find a non-archived person by exact, case-insensitive email within the org. Used by
 * form submissions to match an existing Person before creating a new one. */
export async function findByEmail(organizationId: string, email: string) {
  return tenantDb.person.findFirst({
    where: { organizationId, archivedAt: null, email: { equals: email, mode: "insensitive" } },
  });
}

export async function getPerson(organizationId: string, personId: string) {
  return tenantDb.person.findFirst({
    where: { id: personId, organizationId },
    include: {
      household: { include: { members: { where: { archivedAt: null }, orderBy: { firstName: "asc" } } } },
      campus: { select: { id: true, name: true } },
      relationshipsFrom: { include: { relatedPerson: true } },
    },
  });
}

export async function createPerson(organizationId: string, input: PersonInput) {
  // rawDb.$transaction (not tenantDb) so the PersonCreated outbox event commits
  // atomically with the person row (BLUEPRINT §38) -- organizationId is set explicitly on
  // both writes, preserving the scoping invariant the guard would otherwise enforce.
  return rawDb.$transaction(async (tx) => {
    const person = await tx.person.create({
      data: {
        organizationId,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        preferredName: input.preferredName?.trim() || null,
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
        membershipStatus: input.membershipStatus ?? MembershipStatus.VISITOR,
        birthdate: input.birthdate ?? null,
        tags: input.tags ?? [],
        notes: input.notes?.trim() || null,
        householdId: input.householdId ?? null,
        householdRole: input.householdRole ?? null,
        campusId: input.campusId ?? null,
      },
    });
    await emit(tx, {
      organizationId,
      type: "PersonCreated",
      payload: {
        personId: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.email,
        membershipStatus: person.membershipStatus,
      },
    });
    return person;
  });
}

export async function updatePerson(organizationId: string, personId: string, input: Partial<PersonInput>) {
  // Unchecked variant so foreign-key scalars (householdId, campusId) can be set
  // directly -- updateMany's "checked" input omits relation FKs.
  const data: Prisma.PersonUncheckedUpdateManyInput = {};
  if (input.firstName !== undefined) data.firstName = input.firstName.trim();
  if (input.lastName !== undefined) data.lastName = input.lastName.trim();
  if (input.preferredName !== undefined) data.preferredName = input.preferredName?.trim() || null;
  if (input.email !== undefined) data.email = input.email?.trim() || null;
  if (input.phone !== undefined) data.phone = input.phone?.trim() || null;
  if (input.membershipStatus !== undefined) data.membershipStatus = input.membershipStatus;
  if (input.birthdate !== undefined) data.birthdate = input.birthdate;
  if (input.tags !== undefined) data.tags = input.tags;
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null;
  if (input.householdId !== undefined) data.householdId = input.householdId;
  if (input.householdRole !== undefined) data.householdRole = input.householdRole;
  if (input.campusId !== undefined) data.campusId = input.campusId;

  const result = await tenantDb.person.updateMany({ where: { id: personId, organizationId }, data });
  if (result.count === 0) return null;
  return getPerson(organizationId, personId);
}

/**
 * Email consent (BLUEPRINT §19: explicit, timestamped, auditable). Callers must record
 * the person.email_opt_out_set/cleared audit event. Enforced by
 * message-service.queueMessage for person-linked sends.
 */
export async function setEmailOptOut(organizationId: string, personId: string, optedOut: boolean) {
  const result = await tenantDb.person.updateMany({
    where: { id: personId, organizationId },
    data: { emailOptedOutAt: optedOut ? new Date() : null },
  });
  return result.count > 0;
}

export async function archivePerson(organizationId: string, personId: string) {
  const result = await tenantDb.person.updateMany({
    where: { id: personId, organizationId },
    data: { archivedAt: new Date() },
  });
  return result.count > 0;
}

export async function restorePerson(organizationId: string, personId: string) {
  const result = await tenantDb.person.updateMany({
    where: { id: personId, organizationId },
    data: { archivedAt: null },
  });
  return result.count > 0;
}

// -- Households ----------------------------------------------------------------

export interface HouseholdInput {
  name: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

export async function listHouseholds(organizationId: string, opts: { includeArchived?: boolean } = {}) {
  return tenantDb.household.findMany({
    where: { organizationId, ...(opts.includeArchived ? {} : { archivedAt: null }) },
    orderBy: { name: "asc" },
    include: { _count: { select: { members: true } } },
  });
}

export async function getHousehold(organizationId: string, householdId: string) {
  return tenantDb.household.findFirst({
    where: { id: householdId, organizationId },
    include: { members: { where: { archivedAt: null }, orderBy: [{ householdRole: "asc" }, { firstName: "asc" }] } },
  });
}

export async function createHousehold(organizationId: string, input: HouseholdInput) {
  return tenantDb.household.create({
    data: {
      organizationId,
      name: input.name.trim(),
      addressLine1: input.addressLine1?.trim() || null,
      addressLine2: input.addressLine2?.trim() || null,
      city: input.city?.trim() || null,
      region: input.region?.trim() || null,
      postalCode: input.postalCode?.trim() || null,
      country: input.country?.trim() || null,
    },
  });
}

export async function updateHousehold(organizationId: string, householdId: string, input: Partial<HouseholdInput>) {
  const data: Prisma.HouseholdUpdateManyMutationInput = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.addressLine1 !== undefined) data.addressLine1 = input.addressLine1?.trim() || null;
  if (input.addressLine2 !== undefined) data.addressLine2 = input.addressLine2?.trim() || null;
  if (input.city !== undefined) data.city = input.city?.trim() || null;
  if (input.region !== undefined) data.region = input.region?.trim() || null;
  if (input.postalCode !== undefined) data.postalCode = input.postalCode?.trim() || null;
  if (input.country !== undefined) data.country = input.country?.trim() || null;

  const result = await tenantDb.household.updateMany({ where: { id: householdId, organizationId }, data });
  if (result.count === 0) return null;
  return getHousehold(organizationId, householdId);
}

export async function archiveHousehold(organizationId: string, householdId: string) {
  const result = await tenantDb.household.updateMany({
    where: { id: householdId, organizationId },
    data: { archivedAt: new Date() },
  });
  return result.count > 0;
}

/**
 * Assign a person to a household (or clear it with householdId=null). Scoped by
 * organizationId on the Person update -- a person can only be moved within their own
 * tenant. Setting a household without a role defaults the role to ADULT.
 */
export async function setHousehold(
  organizationId: string,
  personId: string,
  householdId: string | null,
  role: HouseholdRole | null = null,
) {
  const result = await tenantDb.person.updateMany({
    where: { id: personId, organizationId },
    data: {
      householdId,
      householdRole: householdId ? (role ?? HouseholdRole.ADULT) : null,
    },
  });
  return result.count > 0;
}

// -- Relationships -------------------------------------------------------------

/**
 * Create a relationship and its reciprocal so both people see the tie. Both persons are
 * verified to belong to this organization first (defense against relating across
 * tenants). Idempotent on the unique (personId, relatedPersonId, type) triple.
 */
export async function addRelationship(
  organizationId: string,
  personId: string,
  relatedPersonId: string,
  type: PersonRelationshipType,
) {
  if (personId === relatedPersonId) throw new Error("A person cannot have a relationship with themselves.");

  const memberIds = await tenantDb.person.findMany({
    where: { organizationId, id: { in: [personId, relatedPersonId] } },
    select: { id: true },
  });
  if (memberIds.length !== 2) throw new Error("Both people must belong to this organization.");

  const inverse = inverseRelationshipType(type);
  await tenantDb.personRelationship.createMany({
    data: [
      { organizationId, personId, relatedPersonId, type },
      { organizationId, personId: relatedPersonId, relatedPersonId: personId, type: inverse },
    ],
    skipDuplicates: true,
  });
  return listRelationships(organizationId, personId);
}

export async function listRelationships(organizationId: string, personId: string) {
  return tenantDb.personRelationship.findMany({
    where: { organizationId, personId },
    include: { relatedPerson: true },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Remove a relationship and its reciprocal. Scoped by organizationId so a caller can
 * only touch their own tenant's rows.
 */
export async function removeRelationship(
  organizationId: string,
  personId: string,
  relatedPersonId: string,
  type: PersonRelationshipType,
) {
  const inverse = inverseRelationshipType(type);
  const result = await tenantDb.personRelationship.deleteMany({
    where: {
      organizationId,
      OR: [
        { personId, relatedPersonId, type },
        { personId: relatedPersonId, relatedPersonId: personId, type: inverse },
      ],
    },
  });
  return result.count > 0;
}
