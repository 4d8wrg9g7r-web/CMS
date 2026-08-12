import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, CalendarClock, Trash2, Undo2, UserPlus, X } from "lucide-react";
import { groupService, groupSpaceService, peopleService, personDisplayName } from "@cms/database";
import { campusService } from "@cms/database";
import { GroupSpaceStaffPanel } from "../../../../components/GroupSpaceStaffPanel";
import { AutoSubmitSelect } from "../../../../components/AutoSubmitSelect";
import { Avatar } from "../../../../components/ui/Avatar";
import { Badge } from "../../../../components/ui/Badge";
import { buttonClasses } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { Select } from "../../../../components/ui/Input";
import { GroupForm } from "../../../../components/GroupForm";
import { GROUP_ROLE_OPTIONS, groupEnrollmentLabel, groupRoleLabel, groupTypeLabel } from "../../../../lib/groups-format";
import { canGroups, requireGroups } from "../../../../lib/groups-access";
import { timeAgo } from "../../../../lib/format";
import { getCurrentOrganization } from "../../../../lib/session";
import {
  addGroupMemberAction,
  archiveGroupAction,
  removeGroupMemberAction,
  restoreGroupAction,
  updateGroupAction,
  updateGroupMemberRoleAction,
} from "../actions";

/**
 * Group detail (docs/design-system.md "Detail pages"): identity header with a
 * health strip (members/capacity, leaders, last activity), then tabs —
 * Members, Community (the group-space staff view), Settings. Same
 * capabilities as before, organized around what a staffer actually checks.
 */

type Tab = "members" | "community" | "settings";

export default async function GroupDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const organization = await getCurrentOrganization();
  if (!organization) return null;
  await requireGroups(organization.id, "group.view");
  const canManage = await canGroups(organization.id, "group.manage");

  const { groupId } = await params;
  const { tab: rawTab } = await searchParams;
  const group = await groupService.getGroup(organization.id, groupId);
  if (!group) notFound();

  const tab: Tab = (["members", "community", "settings"] as const).includes(rawTab as Tab) ? (rawTab as Tab) : "members";

  const [campuses, allPeople, space] = await Promise.all([
    campusService.listCampuses(organization.id),
    peopleService.listPeople(organization.id, { take: 200 }),
    // Staff view (null viewer): full stream including hidden posts + prayer authors.
    groupSpaceService.getGroupSpace(organization.id, groupId, null),
  ]);
  const memberIds = new Set(group.memberships.map((m) => m.personId));
  const addablePeople = allPeople.filter((p) => !memberIds.has(p.id));
  const atCapacity = group.capacity != null && group._count.memberships >= group.capacity;

  const leaders = group.memberships.filter((m) => m.role === "LEADER");
  const lastActivityAt = space?.stream?.[0]?.createdAt ? new Date(space.stream[0]!.createdAt) : null;
  const fillPct = group.capacity ? Math.min(100, Math.round((group._count.memberships / group.capacity) * 100)) : null;

  const boundUpdate = updateGroupAction.bind(null, group.id);
  const boundAddMember = addGroupMemberAction.bind(null, group.id);

  const tabHref = (key: Tab) => (key === "members" ? `/groups/${group.id}` : `/groups/${group.id}?tab=${key}`);
  const TABS: { key: Tab; label: string; show: boolean }[] = [
    { key: "members", label: "Members", show: true },
    { key: "community", label: "Community", show: Boolean(space) },
    { key: "settings", label: "Settings", show: canManage },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/groups" className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
        <ArrowLeft size={15} /> Groups
      </Link>

      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-display text-[28px] leading-tight text-ink">{group.name}</h1>
          <Badge variant="info">{groupTypeLabel(group.type)}</Badge>
          {group.isPublished ? <Badge variant="success">Listed</Badge> : <Badge>Unlisted</Badge>}
          {group.archivedAt && <Badge variant="warning">Archived</Badge>}
        </div>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] text-ink-secondary">
          {group.meetingSchedule && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock size={15} className="text-ink-muted" /> {group.meetingSchedule}
            </span>
          )}
          {group.meetingLocation && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={15} className="text-ink-muted" /> {group.meetingLocation}
            </span>
          )}
          {group.campus && <span>{group.campus.name}</span>}
        </p>
      </div>

      {/* Health strip: the four things a staffer checks first. */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4" data-section="group-health">
        <Card padding="md">
          <p className="text-[13px] font-medium text-ink-secondary">Members</p>
          <p className="text-metric mt-1.5 text-[28px] leading-none text-ink">
            {group._count.memberships}
            {group.capacity ? <span className="text-base text-ink-muted"> / {group.capacity}</span> : null}
          </p>
          {fillPct !== null && (
            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
              <div className={`h-full rounded-full ${atCapacity ? "bg-warning" : "bg-accent"}`} style={{ width: `${fillPct}%` }} />
            </div>
          )}
        </Card>
        <Card padding="md">
          <p className="text-[13px] font-medium text-ink-secondary">Leaders</p>
          <p className="text-metric mt-1.5 text-[28px] leading-none text-ink">{leaders.length}</p>
          <p className="mt-2 truncate text-xs text-ink-muted">
            {leaders.map((l) => personDisplayName(l.person)).join(", ") || "None assigned"}
          </p>
        </Card>
        <Card padding="md">
          <p className="text-[13px] font-medium text-ink-secondary">Last activity</p>
          <p className="mt-1.5 text-[17px] font-semibold text-ink">{lastActivityAt ? timeAgo(lastActivityAt) : "Quiet"}</p>
          <p className="mt-1 text-xs text-ink-muted">{lastActivityAt ? "in the group space" : "No posts yet"}</p>
        </Card>
        <Card padding="md">
          <p className="text-[13px] font-medium text-ink-secondary">Enrollment</p>
          <p className="mt-1.5 text-[17px] font-semibold text-ink">{groupEnrollmentLabel(group.enrollment)}</p>
          {atCapacity && <p className="mt-1 text-xs font-medium text-warning">At capacity</p>}
        </Card>
      </div>

      <nav className="mb-8 flex items-center gap-1 border-b border-border" aria-label="Group sections">
        {TABS.filter((t) => t.show).map((t) => (
          <Link
            key={t.key}
            href={tabHref(t.key)}
            aria-current={tab === t.key ? "page" : undefined}
            className={`-mb-px border-b-2 px-3.5 py-2.5 text-sm transition-colors duration-180 ${
              tab === t.key ? "border-accent font-semibold text-ink" : "border-transparent font-medium text-ink-secondary hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "members" && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card padding="md" className="lg:col-span-2" data-section="group-members">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Roster</h2>
              {atCapacity && <Badge variant="warning">At capacity</Badge>}
            </div>

            {group.memberships.length === 0 ? (
              <p className="py-4 text-sm text-ink-muted">No members yet — add the first one below.</p>
            ) : (
              <ul className="divide-y divide-border">
                {group.memberships.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 py-2.5">
                    <Avatar name={personDisplayName(m.person)} photoUrl={m.person.photoUrl} size={34} />
                    <Link href={`/people/${m.personId}`} className="min-w-0 flex-1 truncate text-sm font-medium text-ink hover:text-accent">
                      {personDisplayName(m.person)}
                    </Link>
                    <div className="flex items-center gap-2">
                      {canManage ? (
                        <form action={updateGroupMemberRoleAction.bind(null, group.id, m.personId)}>
                          <AutoSubmitSelect
                            name="role"
                            defaultValue={m.role}
                            options={GROUP_ROLE_OPTIONS}
                            className="rounded-sm border border-border-strong bg-surface px-2 py-1 text-xs text-ink"
                          />
                        </form>
                      ) : (
                        <span className="text-xs text-ink-muted">{groupRoleLabel(m.role)}</span>
                      )}
                      {canManage && (
                        <form action={removeGroupMemberAction.bind(null, group.id, m.personId)}>
                          <button
                            type="submit"
                            aria-label={`Remove ${personDisplayName(m.person)}`}
                            className="rounded-sm p-1 text-ink-muted hover:bg-surface-muted hover:text-danger"
                          >
                            <X size={14} />
                          </button>
                        </form>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {canManage && (
              <form action={boundAddMember} className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
                <label className="text-xs text-ink-secondary">
                  Add member
                  <Select name="personId" defaultValue="" required disabled={atCapacity} className="mt-1 w-56 text-sm">
                    <option value="" disabled>
                      {addablePeople.length === 0 ? "Everyone is already in this group" : "Choose a person…"}
                    </option>
                    {addablePeople.map((p) => (
                      <option key={p.id} value={p.id}>
                        {personDisplayName(p)}
                      </option>
                    ))}
                  </Select>
                </label>
                <Select name="role" defaultValue="MEMBER" disabled={atCapacity} className="w-36 text-sm">
                  {GROUP_ROLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
                <button type="submit" disabled={atCapacity || addablePeople.length === 0} className={buttonClasses("secondary", "sm")}>
                  <UserPlus size={14} /> Add
                </button>
              </form>
            )}
          </Card>

          <Card padding="md" className="h-fit">
            <h2 className="mb-3 text-sm font-semibold text-ink">About</h2>
            {group.description ? (
              <p className="text-sm text-ink-secondary">{group.description}</p>
            ) : (
              <p className="text-sm text-ink-muted">No description yet.</p>
            )}
          </Card>
        </div>
      )}

      {tab === "community" && space && (
        <GroupSpaceStaffPanel space={space} churchName={organization.name} canManage={canManage} />
      )}

      {tab === "settings" && canManage && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card padding="md" className="lg:col-span-2">
            <h2 className="mb-4 text-sm font-semibold text-ink">Group details</h2>
            <GroupForm
              action={boundUpdate}
              group={group}
              campuses={campuses.map((c) => ({ id: c.id, name: c.name }))}
              submitLabel="Save changes"
            />
          </Card>
          <Card padding="md" className="h-fit">
            <h2 className="mb-2 text-sm font-semibold text-ink">Status</h2>
            {group.archivedAt ? (
              <>
                <p className="mb-3 text-xs text-ink-muted">
                  Archived {new Date(group.archivedAt).toLocaleDateString()}. Membership history is preserved.
                </p>
                <form action={restoreGroupAction.bind(null, group.id)}>
                  <button type="submit" className={buttonClasses("secondary", "sm") + " w-full"}>
                    <Undo2 size={14} /> Restore group
                  </button>
                </form>
              </>
            ) : (
              <>
                <p className="mb-3 text-xs text-ink-muted">Archiving hides this group without deleting it.</p>
                <form action={archiveGroupAction.bind(null, group.id)}>
                  <button type="submit" className={buttonClasses("danger", "sm") + " w-full"}>
                    <Trash2 size={14} /> Archive group
                  </button>
                </form>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
