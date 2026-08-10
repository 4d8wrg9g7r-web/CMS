# Groups

**Status:** Implemented (v1)
**Owner:** Platform
**Reliability tier:** C (operational)

Implements [BLUEPRINT §8 (Groups)](../architecture/BLUEPRINT.md#8-groups). Groups are the
first module to **compose** the `Person` primitive (via `GroupMembership`) rather than
inventing their own people records — the platform thesis in practice
([docs/domain/people.md](./people.md)).

## Problem
A church runs small groups, classes, and teams. Staff need one place to define groups,
publish a group directory, and manage who leads and belongs to each — reusing the same
People records, not a separate roster per tool. Success = staff can create groups, assign
leaders/members from existing People, and see each person's group involvement.

## Actors
- **Owner / Admin** — full view + manage of Groups and memberships.
- **Content Manager / Analytics Viewer / Prayer Moderator** — **no** access. Group
  membership lists reveal who belongs where (Person data is Confidential), so v1 gates
  Groups at Owner/Admin, matching People. Enforced server-side with negative tests.

## Scope
- **Included (v1):** Group profiles (name, type, description, enrollment mode, meeting
  schedule/location, capacity, home campus), group-finder publish flag, membership with a
  leader/co-leader/member role, capacity enforcement, soft archival, audit events, and a
  read-only "Groups" panel on each Person's detail page.
- **Explicitly excluded (non-goals, deferred):** attendance tracking, RSVPs, seasons,
  applications/approval flow, curriculum/resources, group messaging, childcare metadata,
  and health dashboards. Attendance + health analytics compose onto this later; messaging
  waits for the Communications engine.

## Data
New tenant-scoped models (carry `organizationId`; registered in the tenant guard):

- **Group** — `organizationId`, `name`, `type` (`SMALL_GROUP|CLASS|MINISTRY_TEAM|
  SERVING_TEAM|OTHER`), `description?`, `enrollment` (`OPEN|REQUEST|INVITE_ONLY|CLOSED`,
  default `OPEN`), `meetingSchedule?`, `meetingLocation?`, `capacity?` (null = unlimited),
  `isPublished` (group-finder visibility, default false), optional `campusId` (home
  campus — reuses the first-class `Campus` primitive, `onDelete: SetNull`), `archivedAt?`,
  timestamps.
- **GroupMembership** — `organizationId`, `groupId`, `personId`, `role`
  (`LEADER|CO_LEADER|MEMBER`, default `MEMBER`), `joinedAt`, timestamp. Unique on
  `(groupId, personId)` — a person holds one membership row per group.

**Classification:** Group definitions are Internal; membership rows link to Confidential
Person records, so access is gated accordingly. **Retention:** soft archival via
`archivedAt` (BLUEPRINT §36).

## Permissions
`can(role, action)` matrix (pure, in `@cms/database` `groupPermissions`, unit-tested):

| Action | OWNER | ADMIN | CONTENT_MANAGER | ANALYTICS_VIEWER |
| --- | --- | --- | --- | --- | --- |
| `group.view` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `group.manage` | ✅ | ✅ | ❌ | ❌ | ❌ |

Enforced server-side via `requireGroups` in every page and action.

## Commands
`createGroup`, `updateGroup`, `archiveGroup`/`restoreGroup`, `addMember` (capacity-checked;
verifies both group and person belong to the org), `updateMemberRole`, `removeMember`.
All scoped by `organizationId`; each records an audit event.

## Queries
`listGroups(orgId, {search, type, publishedOnly, includeArchived, skip, take})`,
`countGroups`, `getGroup` (includes members → person, ordered leaders-first),
`listGroupsForPerson` (powers the Person detail panel).

## Events
None in v1 (no workflow engine yet). `GroupMemberAdded` / `GroupCreated` become domain
events once the outbox/workflow engine lands.

## Workflows
None in v1. Enrollment-request approval and follow-up automation compose onto the shared
workflow engine later.

## UI states
List: empty (no groups / no matches), populated table, permission-denied panel. Detail:
member list with capacity indicator, add-member (person select), role change, remove,
archived state with restore.

## Failure modes
Adding a member past `capacity` throws a clear error. Duplicate membership is a no-op
(unique constraint + `skipDuplicates`). Archival is reversible.

## Audit
`group.created`, `group.updated`, `group.archived`, `group.restored`,
`group.member_added`, `group.member_role_updated`, `group.member_removed` — actor, target,
safe metadata (ids/roles).

## Tests
- **Unit (pure, `@cms/database`):** the `can(role, action)` matrix (positive for
  Owner/Admin, **negative for every other role**); `hasCapacity`; `Group`/`GroupMembership`
  registered as tenant-scoped.
- **Live smoke:** group creation, member add with capacity enforcement, tenant isolation,
  and `listGroupsForPerson`, verified against Postgres.

## Migration
Additive migration `add_groups` — new enums, tables, FKs, indexes; no existing tables
changed, so backward-safe for rolling deploys.

## Unresolved risks
- **Campus modeling** — resolved at the Ruach/CMS separation: `Group.campusId` now
  points at the first-class `Campus` model.
- **Capacity race** — capacity is enforced with a read-then-write in the service; under
  concurrent adds a group could momentarily exceed capacity. Acceptable for v1's scale; a
  DB constraint or transactional count belongs with attendance work if it becomes real.
