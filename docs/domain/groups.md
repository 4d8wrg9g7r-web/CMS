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

---

# Group space (v2)

The group space turns each group into a place its members live in — chat, prayer, events,
polls — surfaced identically in three places: the church app's PWA
(`/a/<publicAppId>/group/<groupId>`), the native app (Bearer API, same JSON), and the
dashboard's staff view on `/groups/<groupId>`. One service
(`group-space-service.ts`) produces one serializable payload (`GroupSpace`) for all three.

## Concepts

- **Stream** — `GroupPost` with `kind` MESSAGE | LINK | PRAYER. Links require an http(s)
  URL. Prayer posts can be `anonymous`: members (and other leaders) see "Anonymous", but
  the **dashboard staff view always sees the author** — moderation needs authorship.
  `GroupPostPrayer` rows are "I'm praying" toggles (one per person, with a count).
  Leaders can hide/restore posts (`hiddenAt`); hidden posts vanish for members but stay
  visible (dimmed) to leaders and staff. Staff can post as the church
  (`authorUserId` set, `personId` null → rendered under the church's name).
- **Group events** — `GroupEvent` + `GroupEventRsvp`, completely separate from the
  church-wide `Event` model (no registration forms, no public calendar). Members RSVP
  GOING | MAYBE | NO; leaders mark attendance (`attended` tri-state on the RSVP row —
  walk-ins get a NO-status row created at marking time). Archivable, not deletable.
- **Polls** — `GroupPoll` (2–10 options as JSON) + one changeable `GroupPollVote` per
  member until the poll is closed (`closedAt`). Results show per-option counts.
- **Member management** — leaders add by email (matches an existing Person
  case-insensitively, or creates a lightweight VISITOR Person — first/last name required
  for new people), remove members (never themselves), and email the whole group through
  the blast pipeline (`createEmailBlast` group audience → consent-checked, logged
  Messages). The dashboard's "Email the group" button deep-links the full block composer
  prefilled with the group audience.

## Authorization

Two ladders, one per surface:
- **App (member identity):** `requireMember` gates reading the space and posting;
  `requireLeader` (role ≠ MEMBER, i.e. LEADER or CO_LEADER) gates moderation, events,
  attendance, polls admin, member management, and email.
- **Dashboard (staff identity):** `group.view` to see the space, `group.manage` for all
  writes — staff view calls `getGroupSpace(orgId, groupId, null)`; the null viewer means
  "staff": hidden posts included, anonymous prayer authors revealed, `isLeader: true`.

## API (additive, under /api/app/v1/apps/[publicAppId]/groups)

`GET /groups` (my memberships with `is_leader`), `GET /groups/[id]` (space payload),
`POST /groups/[id]/posts` and `/posts/[postId]` (`pray` | `hide` | `restore`),
`/events` and `/events/[id]` (`rsvp` | `attendance` | `archive`), `/polls` and
`/polls/[id]` (`vote` | `close`), `/members` (`add` | `remove`), `/email`.
All Bearer-authenticated, `cache-control: no-store`.

## Audit (staff actions)

`group.post_created`, `group.post_hidden`, `group.post_restored`, `group.event_created`,
`group.event_archived`, `group.attendance_marked`, `group.poll_created`,
`group.poll_closed` — actor, group target, safe metadata.

## Migration

Additive migration `add_group_space` — `GroupPost`, `GroupPostPrayer`, `GroupEvent`,
`GroupEventRsvp`, `GroupPoll`, `GroupPollVote` (+ enums); all registered in the tenant
guard; no existing tables changed.

## Profile sync

App members **are** dashboard Person records (email-code sign-in resolves to the Person
by email), so everything in the group space writes to the same rows staff see: RSVPs,
attendance, prayer posts, poll votes all hang off `personId`, and group membership is the
same `GroupMembership` row managed on the dashboard group page.
