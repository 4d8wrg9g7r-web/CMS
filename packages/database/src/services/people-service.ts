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
  campusId?: string;
  includeArchived?: boolean;
  /** Only people added within the last N days (the People list's "New" tab). */
  createdWithinDays?: number;
  skip?: number;
  take?: number;
}

function peopleWhere(organizationId: string, opts: ListPeopleOptions): Prisma.PersonWhereInput {
  const where: Prisma.PersonWhereInput = { organizationId };
  if (!opts.includeArchived) where.archivedAt = null;
  if (opts.status) where.membershipStatus = opts.status;
  if (opts.householdId) where.householdId = opts.householdId;
  if (opts.campusId) where.campusId = opts.campusId;
  if (opts.createdWithinDays) {
    where.createdAt = { gte: new Date(Date.now() - opts.createdWithinDays * 24 * 60 * 60 * 1000) };
  }
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
      fieldValues: { include: { field: true } },
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

// -- CSV import ----------------------------------------------------------------

import { randomUUID } from "crypto";
import type { ImportPersonRow, ImportRowError } from "../people/import";
import type { ResolvedImportField } from "../people/import-mapping";
import type { PersonFieldValueJson } from "../people/custom-fields";

const MAX_STORED_IMPORT_ERRORS = 100;

/** Per-row wizard extras: household grouping + coerced custom-field values. */
export interface ImportRowExtras {
  householdName: string | null;
  custom: Record<string, PersonFieldValueJson>;
}

/**
 * Bulk-creates validated import rows (docs/domain/people-import.md) and records a
 * PersonImport summary. Rows whose email matches an existing non-archived Person
 * (case-insensitive) are skipped, never merged — imports are safe to re-run.
 *
 * DELIBERATE: this path does NOT emit PersonCreated outbox events, unlike
 * createPerson — a 500-row import must not enqueue 500 workflow runs (e.g. welcome
 * emails to long-standing members). If "run automations on import" is ever wanted it
 * becomes an explicit option, not a default.
 */
export async function importPeople(
  organizationId: string,
  input: {
    rows: (ImportPersonRow & { extras?: ImportRowExtras })[];
    parseErrors: ImportRowError[];
    totalRows: number;
    fileName?: string | null;
    createdByUserId?: string | null;
    /** Custom fields this run writes (resolved by extractExtraColumns). */
    fields?: ResolvedImportField[];
  },
) {
  const emails = input.rows.map((r) => r.email).filter((e): e is string => !!e);
  const existing = emails.length
    ? await tenantDb.person.findMany({
        where: { organizationId, archivedAt: null, email: { in: emails, mode: "insensitive" } },
        select: { email: true },
      })
    : [];
  const existingEmails = new Set(existing.map((p) => p.email?.toLowerCase()).filter(Boolean));

  const toCreate = input.rows.filter((r) => !(r.email && existingEmails.has(r.email.toLowerCase())));
  const skippedCount = input.rows.length - toCreate.length;

  // Ensure custom-field definitions exist (reuse by key; extend select options).
  const fieldIdByKey = new Map<string, string>();
  for (const field of input.fields ?? []) {
    const current = await tenantDb.personFieldDefinition.findFirst({
      where: { organizationId, key: field.key },
    });
    if (!current) {
      const created = await tenantDb.personFieldDefinition.create({
        data: {
          organizationId,
          key: field.key,
          label: field.label,
          type: field.type,
          options: field.options,
        },
      });
      fieldIdByKey.set(field.key, created.id);
    } else {
      const newOptions = field.options.filter(
        (o) => !current.options.some((c) => c.toLowerCase() === o.toLowerCase()),
      );
      if (newOptions.length > 0) {
        await tenantDb.personFieldDefinition.update({
          where: { id: current.id },
          data: { options: [...current.options, ...newOptions] },
        });
      }
      fieldIdByKey.set(field.key, current.id);
    }
  }

  // Find-or-create households named in the file (case-insensitive, unarchived).
  const householdNames = [
    ...new Map(
      toCreate
        .map((r) => r.extras?.householdName)
        .filter((n): n is string => !!n)
        .map((n) => [n.toLowerCase(), n]),
    ).values(),
  ];
  const householdIdByName = new Map<string, string>();
  if (householdNames.length > 0) {
    const existingHouseholds = await tenantDb.household.findMany({
      where: { organizationId, archivedAt: null, name: { in: householdNames, mode: "insensitive" } },
      select: { id: true, name: true },
    });
    for (const h of existingHouseholds) householdIdByName.set(h.name.toLowerCase(), h.id);
    for (const name of householdNames) {
      if (householdIdByName.has(name.toLowerCase())) continue;
      const created = await tenantDb.household.create({ data: { organizationId, name } });
      householdIdByName.set(name.toLowerCase(), created.id);
    }
  }

  if (toCreate.length > 0) {
    // IDs are generated here (not by the DB default) so field values can reference
    // the new people without a per-row round trip.
    const withIds = toCreate.map((r) => ({ ...r, id: randomUUID() }));
    await tenantDb.person.createMany({
      data: withIds.map((r) => ({
        id: r.id,
        organizationId,
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        phone: r.phone,
        membershipStatus: r.membershipStatus,
        tags: r.tags,
        campusId: r.campusId,
        householdId: r.extras?.householdName
          ? (householdIdByName.get(r.extras.householdName.toLowerCase()) ?? null)
          : null,
      })),
    });

    const valueRows = withIds.flatMap((r) =>
      Object.entries(r.extras?.custom ?? {}).flatMap(([key, value]) => {
        const fieldId = fieldIdByKey.get(key);
        return fieldId
          ? [{ organizationId, personId: r.id, fieldId, value: value as Prisma.InputJsonValue }]
          : [];
      }),
    );
    if (valueRows.length > 0) {
      await tenantDb.personFieldValue.createMany({ data: valueRows });
    }
  }

  const errors = input.parseErrors.slice(0, MAX_STORED_IMPORT_ERRORS);
  const record = await tenantDb.personImport.create({
    data: {
      organizationId,
      fileName: input.fileName ?? null,
      totalRows: input.totalRows,
      createdCount: toCreate.length,
      skippedCount,
      errorCount: input.parseErrors.length,
      errors: errors as unknown as Prisma.InputJsonValue,
      createdByUserId: input.createdByUserId ?? null,
    },
  });

  return {
    importId: record.id,
    createdCount: toCreate.length,
    skippedCount,
    errorCount: input.parseErrors.length,
    errors,
  };
}

export async function listImports(organizationId: string, limit = 10) {
  return tenantDb.personImport.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { createdBy: { select: { id: true, name: true, email: true } } },
  });
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

// -- Custom fields ---------------------------------------------------------------

import { PersonFieldType } from "@prisma/client";
import { slugifyFieldKey } from "../people/custom-fields";

export async function listFieldDefinitions(organizationId: string, opts: { includeArchived?: boolean } = {}) {
  return tenantDb.personFieldDefinition.findMany({
    where: { organizationId, ...(opts.includeArchived ? {} : { archivedAt: null }) },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Create a field definition, reusing any existing definition with the same key —
 * imports and manual creation converge on one field per key per org. There is
 * deliberately no cap on how many definitions an organization may have.
 */
export async function createFieldDefinition(
  organizationId: string,
  input: { label: string; type: PersonFieldType; options?: string[] },
) {
  const key = slugifyFieldKey(input.label);
  if (!key) throw new Error("The field needs a name.");
  const existing = await tenantDb.personFieldDefinition.findFirst({ where: { organizationId, key } });
  if (existing) {
    if (existing.archivedAt) {
      return tenantDb.personFieldDefinition.update({ where: { id: existing.id }, data: { archivedAt: null } });
    }
    return existing;
  }
  return tenantDb.personFieldDefinition.create({
    data: {
      organizationId,
      key,
      label: input.label.trim(),
      type: input.type,
      options: (input.options ?? []).map((o) => o.trim()).filter(Boolean),
    },
  });
}

/** Rename / adjust options. The key and type stay fixed so stored values remain valid. */
export async function updateFieldDefinition(
  organizationId: string,
  fieldId: string,
  input: { label?: string; options?: string[] },
) {
  const data: Prisma.PersonFieldDefinitionUpdateManyMutationInput = {};
  if (input.label !== undefined && input.label.trim()) data.label = input.label.trim();
  if (input.options !== undefined) data.options = input.options.map((o) => o.trim()).filter(Boolean);
  const result = await tenantDb.personFieldDefinition.updateMany({
    where: { id: fieldId, organizationId },
    data,
  });
  return result.count > 0;
}

/** Archive (never delete) so historical values stay interpretable. */
export async function archiveFieldDefinition(organizationId: string, fieldId: string) {
  const result = await tenantDb.personFieldDefinition.updateMany({
    where: { id: fieldId, organizationId },
    data: { archivedAt: new Date() },
  });
  return result.count > 0;
}

/**
 * Upsert a person's custom-field values. `null` clears a value (the row is removed);
 * values are expected pre-coerced to the definition's JSON shape (custom-fields.ts).
 */
export async function setPersonFieldValues(
  organizationId: string,
  personId: string,
  values: Record<string, unknown | null>,
) {
  const person = await tenantDb.person.findFirst({ where: { id: personId, organizationId }, select: { id: true } });
  if (!person) throw new Error("Person not found.");
  const defs = await tenantDb.personFieldDefinition.findMany({
    where: { organizationId, key: { in: Object.keys(values) } },
  });
  const defByKey = new Map(defs.map((d) => [d.key, d]));
  for (const [key, value] of Object.entries(values)) {
    const def = defByKey.get(key);
    if (!def) continue;
    if (value === null || value === undefined || value === "") {
      await tenantDb.personFieldValue.deleteMany({
        where: { organizationId, personId, fieldId: def.id },
      });
      continue;
    }
    await tenantDb.personFieldValue.upsert({
      where: { personId_fieldId: { personId, fieldId: def.id } },
      update: { value: value as Prisma.InputJsonValue },
      create: { organizationId, personId, fieldId: def.id, value: value as Prisma.InputJsonValue },
    });
  }
  return listPersonFieldValues(organizationId, personId);
}

export async function listPersonFieldValues(organizationId: string, personId: string) {
  return tenantDb.personFieldValue.findMany({
    where: { organizationId, personId },
    include: { field: true },
  });
}

// -- Saved smart filters ---------------------------------------------------------

/**
 * A saved People-list filter (docs/domain/people.md): the config mirrors the
 * list's query params. "Smart" because it stores the criteria, not the matches —
 * every application (and every pinned-card count) re-evaluates live.
 */
export interface PersonFilterConfig {
  q: string | null;
  status: MembershipStatus | null;
  campusId: string | null;
}

export function validatePersonFilterConfig(input: unknown): PersonFilterConfig | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as { q?: unknown; status?: unknown; campusId?: unknown };
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const status = str(raw.status);
  if (status && !Object.values(MembershipStatus).includes(status as MembershipStatus)) return null;
  const config: PersonFilterConfig = {
    q: str(raw.q),
    status: (status as MembershipStatus | null) ?? null,
    campusId: str(raw.campusId),
  };
  if (!config.q && !config.status && !config.campusId) return null; // nothing to save
  return config;
}

export async function listSavedPersonFilters(organizationId: string) {
  return tenantDb.savedPersonFilter.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
  });
}

export async function createSavedPersonFilter(
  organizationId: string,
  input: { name: string; config: PersonFilterConfig; createdByUserId?: string | null },
) {
  const name = input.name.trim();
  if (!name) throw new Error("Give the filter a name.");
  return tenantDb.savedPersonFilter.create({
    data: {
      organizationId,
      name,
      config: input.config as unknown as Prisma.InputJsonValue,
      createdByUserId: input.createdByUserId ?? null,
    },
  });
}

export async function deleteSavedPersonFilter(organizationId: string, filterId: string) {
  const result = await tenantDb.savedPersonFilter.deleteMany({ where: { id: filterId, organizationId } });
  return result.count > 0;
}

/** Pin/unpin a saved filter on the dashboard Overview (live people count card). */
export async function setSavedPersonFilterPinned(organizationId: string, filterId: string, pinned: boolean) {
  const result = await tenantDb.savedPersonFilter.updateMany({
    where: { id: filterId, organizationId },
    data: { pinned },
  });
  return result.count > 0;
}

export async function listPinnedPersonFilters(organizationId: string) {
  return tenantDb.savedPersonFilter.findMany({
    where: { organizationId, pinned: true },
    orderBy: { createdAt: "asc" },
  });
}
