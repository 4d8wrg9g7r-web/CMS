# People & Households

**Status:** Implemented (v1)
**Owner:** Platform
**Reliability tier:** C (operational)

Implements [BLUEPRINT §5 (People & Households)](../architecture/BLUEPRINT.md#5-people--households)
— the canonical `Person` primitive and the `Household` relationship grouping. This is
principle #1 ("One Person model"): every future module (Giving, Groups, Check-In,
Communications, HR, Services) references this same `Person` rather than creating its own
people records.

## Problem
A church needs one canonical record per individual and family, reusable everywhere, instead
of duplicate contact lists per tool. Success = staff can create/find/edit people and
households and see their relationships, with contact data treated as Confidential.

## Actors
- **Owner / Admin** — full access to view and manage People & Households.
- **Content Manager / Analytics Viewer / Prayer Moderator** — **no** access to the People
  CRM (a different security domain; People contact data is Confidential and not needed for
  their function). Enforced server-side with negative tests.

## Scope
- **Included (v1):** Person profiles (name, preferred name, contact email/phone, membership
  status, birthdate, tags, notes, home campus), Households (name + address, members),
  household membership with an adult/child role, person-to-person relationships
  (spouse/parent/child/sibling/guardian/other, stored bidirectionally), search + status
  filter, soft archival (never hard-delete ministry records), and audit events for every
  mutation.
- **Explicitly excluded (non-goals, deferred):** custom fields, duplicate detection/merge,
  bulk import/export (see Integrations & Migration), engagement timeline, per-org
  configurable membership statuses, multiple contact methods per person, and a
  household "primary contact" designation. These compose onto this primitive later.

## Data
New tenant-scoped models (all carry `organizationId`; registered in the tenant guard):

- **Person** — `organizationId`, optional `householdId` + `householdRole`, `firstName`,
  `lastName`, `preferredName?`, `email?`, `phone?`, `membershipStatus`
  (`VISITOR|ATTENDER|MEMBER|INACTIVE`, default `VISITOR`), `birthdate?`, `tags[]`,
  `notes?`, optional `campusId` (home campus — FK to the first-class
  `Campus` model, `onDelete: SetNull`), `archivedAt?`,
  timestamps.
- **Household** — `organizationId`, `name`, address fields (`addressLine1?`,
  `addressLine2?`, `city?`, `region?`, `postalCode?`, `country?`), `archivedAt?`,
  timestamps. Has many `members` (Person).
- **PersonRelationship** — `organizationId`, `personId`, `relatedPersonId`, `type`
  (`SPOUSE|PARENT|CHILD|SIBLING|GRANDPARENT|GRANDCHILD|FOSTER_PARENT|FOSTER_CHILD|GUARDIAN|WARD|OTHER`),
  timestamp. Unique on `(personId, relatedPersonId, type)`. Stored with its reciprocal
  row (`inverseRelationshipType`, pure + unit-tested) so both people see the tie.
- **PersonFieldDefinition** — `organizationId`, `key` (stable slug, unique per org),
  `label`, `type` (`TEXT|NUMBER|DATE|BOOLEAN|SELECT|MULTI_SELECT`), `options[]` (for
  selects), `archivedAt?`, timestamps. **No cap** on definitions per organization.
- **PersonFieldValue** — `organizationId`, `personId`, `fieldId`, `value` (Json shaped
  by the definition type: string | number | boolean | string[]). Unique on
  `(personId, fieldId)`.

### Custom fields
Organizations define unlimited person fields (a "Veteran" checkbox, "Baptism Date",
"Ministry Team" dropdown, …). Definitions are managed in Settings → Person fields and
created automatically by the import wizard ("How should this be displayed in your
database?"); they are keyed by a label slug so repeated imports reuse the same field.
Values render and edit on the person profile's Details card. Pure helpers
(`inferFieldType`, `coerceFieldValue`, `formatFieldValue`, `slugifyFieldKey` in
`people/custom-fields.ts`) own inference/coercion/display; definitions archive, never
delete.

**Classification:** Confidential (person contacts, household data) per
[BLUEPRINT §63](../architecture/BLUEPRINT.md#63-data-classification-rules). **Retention:**
soft archival via `archivedAt` — ministry history is preserved, never blind-deleted
(BLUEPRINT §36).

## Permissions
`can(role, action)` matrix (pure, in `@cms/database` `peoplePermissions`, unit-tested):

| Action | OWNER | ADMIN | CONTENT_MANAGER | ANALYTICS_VIEWER |
| --- | --- | --- | --- | --- | --- |
| `person.view` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `person.manage` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `household.view` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `household.manage` | ✅ | ✅ | ❌ | ❌ | ❌ |

Enforced server-side in every page and server action via `requirePeopleAction`. The
tenant guard independently guarantees `organizationId` scoping at the repository layer.

## Commands
`createPerson`, `updatePerson`, `archivePerson`/`restorePerson`, `createHousehold`,
`updateHousehold`, `archiveHousehold`, `setHousehold` (assign/remove a person to a
household with a role), `addRelationship` (writes both directions using the inverse type),
`removeRelationship`. All scoped by `organizationId`; each mutation records an audit event.

## Queries
`listPeople(orgId, {search, status, householdId, includeArchived, skip, take})`,
`countPeople`, `getPerson` (includes household + both relationship directions),
`listHouseholds`, `getHousehold` (includes members). Read models are purpose-built; no raw
entity leakage.

## Events
None emitted in v1 (no workflow engine yet). When the outbox/workflow engine lands,
`PersonCreated` / `HouseholdCreated` become domain events consumers can subscribe to.

## Workflows
None in v1. Journeys (BLUEPRINT §6) will trigger off Person events via the shared workflow
engine later.

## UI states
List: loading (server-rendered), empty (no people / no search matches), populated table,
permission-denied (non-Owner/Admin sees an access-denied panel). New + detail forms show
validation errors; detail shows archived state with a restore action.

## Failure modes
Validation errors (missing name) surface to the form. Archival is reversible. No external
providers involved in v1, so no retry/duplicate concerns.

## Audit
Every mutation records an `AuditLog` event: `person.created`, `person.updated`,
`person.archived`, `person.restored`, `household.created`, `household.updated`,
`household.archived`, `person.relationship_added`, `person.relationship_removed`, with
actor, target, and safe metadata (never full contact contents beyond identifiers).

## Tests
- **Unit (pure, `@cms/database`):** the `can(role, action)` permission matrix — positive
  for Owner/Admin and **negative for every other role** across all four actions; the
  `inverseRelationshipType` and `personDisplayName` helpers.
- **Tenant isolation:** `Person`, `Household`, `PersonRelationship` are registered in
  `TENANT_SCOPED_MODELS` (asserted by a test), so any unscoped query throws.
- **Migration:** applied via `prisma migrate dev` against a real Postgres.

## Migration
Additive migration `add_people_households` — new enums, tables, FKs, and indexes only; no
changes to existing tables, so it is backward-safe for rolling deploys.

## Unresolved risks
- **Campus modeling.** Resolved at the Ruach/CMS separation: `Campus` is now a
  first-class model and `Person.campusId` points at it.
- **Membership status** is a fixed enum in v1; per-org configurable statuses are deferred.
- **Guardian inverse** is stored as `CHILD` (there is no `DEPENDENT` type yet) — an
  approximation documented in `inverseRelationshipType`.

## Saved smart filters
`SavedPersonFilter` stores a named People-list filter (`config`: q / status /
campusId — the list's own query params). Smart = criteria stored, matches
re-evaluated live wherever the filter appears: chips on /people apply it via the
URL, and `pinned` filters render on the dashboard Overview as live-count cards
(person.view required — no People access, no cards). Saving requires person.view;
validated by `validatePersonFilterConfig` (unknown status rejected, empty configs
refused). Audited as `person.filter_saved` / `person.filter_deleted`.
