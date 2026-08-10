import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, CalendarClock, Trash2, Undo2, UserPlus, X } from "lucide-react";
import { groupService, peopleService, personDisplayName } from "@cms/database";
import { campusService } from "@cms/database";
import { AutoSubmitSelect } from "../../../../components/AutoSubmitSelect";
import { Badge } from "../../../../components/ui/Badge";
import { buttonClasses } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { Select } from "../../../../components/ui/Input";
import { GroupForm } from "../../../../components/GroupForm";
import {
  GROUP_ROLE_OPTIONS,
  groupEnrollmentLabel,
  groupRoleLabel,
  groupTypeLabel,
} from "../../../../lib/groups-format";
import { canGroups, requireGroups } from "../../../../lib/groups-access";
import { getCurrentOrganization } from "../../../../lib/session";
import {
  addGroupMemberAction,
  archiveGroupAction,
  removeGroupMemberAction,
  restoreGroupAction,
  updateGroupAction,
  updateGroupMemberRoleAction,
} from "../actions";

export default async function GroupDetailPage({ params }: { params: Promise<{ groupId: string }> }) {
  const organization = await getCurrentOrganization();
  if (!organization) return null;
  await requireGroups(organization.id, "group.view");
  const canManage = await canGroups(organization.id, "group.manage");

  const { groupId } = await params;
  const group = await groupService.getGroup(organization.id, groupId);
  if (!group) notFound();

  const [campuses, allPeople] = await Promise.all([
    campusService.listCampuses(organization.id),
    peopleService.listPeople(organization.id, { take: 200 }),
  ]);
  const memberIds = new Set(group.memberships.map((m) => m.personId));
  const addablePeople = allPeople.filter((p) => !memberIds.has(p.id));
  const atCapacity = group.capacity != null && group._count.memberships >= group.capacity;

  const boundUpdate = updateGroupAction.bind(null, group.id);
  const boundAddMember = addGroupMemberAction.bind(null, group.id);

  return (
    <div>
      <Link href="/groups" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
        <ArrowLeft size={15} /> Back to Groups
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{group.name}</h1>
        <Badge variant="info">{groupTypeLabel(group.type)}</Badge>
        {group.isPublished ? <Badge variant="success">Published</Badge> : <Badge>Unlisted</Badge>}
        {group.archivedAt && <Badge variant="warning">Archived</Badge>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Members */}
          <Card padding="md">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">
                Members ({group._count.memberships}
                {group.capacity ? ` / ${group.capacity}` : ""})
              </h2>
              {atCapacity && <Badge variant="warning">At capacity</Badge>}
            </div>

            {group.memberships.length === 0 ? (
              <p className="text-sm text-ink-muted">No members yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {group.memberships.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                    <Link href={`/people/${m.personId}`} className="text-sm font-medium text-ink hover:text-accent">
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
                <button
                  type="submit"
                  disabled={atCapacity || addablePeople.length === 0}
                  className={buttonClasses("secondary", "sm")}
                >
                  <UserPlus size={14} /> Add
                </button>
              </form>
            )}
          </Card>

          {/* Edit */}
          {canManage && (
            <Card padding="md">
              <h2 className="mb-4 text-sm font-semibold text-ink">Group details</h2>
              <GroupForm
                action={boundUpdate}
                group={group}
                campuses={campuses.map((c) => ({ id: c.id, name: c.name }))}
                submitLabel="Save changes"
              />
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card padding="md">
            <h2 className="mb-3 text-sm font-semibold text-ink">About</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-ink-muted">Enrollment</dt>
                <dd className="mt-0.5 text-ink">{groupEnrollmentLabel(group.enrollment)}</dd>
              </div>
              {group.meetingSchedule && (
                <div className="flex items-start gap-2 text-ink">
                  <CalendarClock size={15} className="mt-0.5 text-ink-muted" /> {group.meetingSchedule}
                </div>
              )}
              {group.meetingLocation && (
                <div className="flex items-start gap-2 text-ink">
                  <MapPin size={15} className="mt-0.5 text-ink-muted" /> {group.meetingLocation}
                </div>
              )}
              {group.campus && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-ink-muted">Campus</dt>
                  <dd className="mt-0.5 text-ink">{group.campus.name}</dd>
                </div>
              )}
              {group.description && <p className="text-ink-secondary">{group.description}</p>}
            </dl>
          </Card>

          {canManage && (
            <Card padding="md">
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
          )}
        </div>
      </div>
    </div>
  );
}
