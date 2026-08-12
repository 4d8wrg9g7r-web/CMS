import Link from "next/link";
import { headers } from "next/headers";
import { CalendarClock, ExternalLink, Lock, MapPin, Plus, Users2 } from "lucide-react";
import { campusService, groupService, personDisplayName, type GroupType } from "@cms/database";
import { Badge } from "../../../components/ui/Badge";
import { buttonClasses } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Input, Select } from "../../../components/ui/Input";
import { PageHeader } from "../../../components/ui/PageHeader";
import { GROUP_TYPE_OPTIONS, groupTypeLabel } from "../../../lib/groups-format";
import { canGroups } from "../../../lib/groups-access";
import { getCurrentOrganization } from "../../../lib/session";

const PAGE_SIZE = 24;

/**
 * Groups (docs/design-system.md): cards a human can scan — who leads it,
 * when it meets, how full it is — instead of a five-column table. Search,
 * type, campus, and pagination all preserved.
 */
export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; campus?: string; page?: string }>;
}) {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  const [canView, canManage] = await Promise.all([
    canGroups(organization.id, "group.view"),
    canGroups(organization.id, "group.manage"),
  ]);

  if (!canView) {
    return (
      <div>
        <PageHeader title="Groups" />
        <Card padding="md">
          <EmptyState
            icon={<Lock size={22} />}
            title="You don't have access to Groups"
            description="Groups and their membership are restricted to organization owners and admins."
          />
        </Card>
      </div>
    );
  }

  const params = await searchParams;
  const q = params.q?.trim() || undefined;
  const type = (params.type as GroupType | undefined) || undefined;
  const campusId = params.campus || undefined;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const campuses = await campusService.listCampuses(organization.id);
  const opts = { search: q, type, campusId };
  const [groups, total] = await Promise.all([
    groupService.listGroups(organization.id, { ...opts, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    groupService.countGroups(organization.id, opts),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(q || type || campusId);

  return (
    <div>
      <PageHeader
        title="Groups"
        subtitle={`${total.toLocaleString()} ${total === 1 ? "group" : "groups"} at ${organization.name}`}
        actions={
          canManage ? (
            <Link href="/groups/new" className={buttonClasses("primary", "sm")}>
              <Plus size={15} /> New group
            </Link>
          ) : undefined
        }
      />

      <form method="get" className="mb-6 flex flex-wrap items-center gap-2.5">
        <Input name="q" defaultValue={q ?? ""} placeholder="Search groups…" aria-label="Search groups" className="h-11 w-72 rounded-md" />
        <Select name="type" defaultValue={type ?? ""} className="w-44 py-2.5 text-sm" aria-label="Group type">
          <option value="">All types</option>
          {GROUP_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        {campuses.length > 0 && (
          <Select name="campus" defaultValue={campusId ?? ""} className="w-44 py-2.5 text-sm" aria-label="Campus">
            <option value="">All campuses</option>
            {campuses.map((campus) => (
              <option key={campus.id} value={campus.id}>
                {campus.name}
              </option>
            ))}
          </Select>
        )}
        <button type="submit" className={buttonClasses("secondary", "sm")}>
          Apply
        </button>
        <GroupFinderLink publicSiteId={organization.publicSiteId} />
      </form>

      {groups.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<Users2 size={22} />}
            title={hasFilters ? "No groups match" : "Community starts with a group"}
            description={
              hasFilters
                ? "Try a different search or filter."
                : "Create your first group — members, gatherings, prayer, and attendance all live inside it."
            }
            action={
              canManage && !hasFilters ? (
                <Link href="/groups/new" className={buttonClasses("primary", "sm")}>
                  <Plus size={15} /> New group
                </Link>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-section="groups-grid">
          {groups.map((group) => {
            const leaders = group.memberships.map((m) => personDisplayName(m.person)).join(", ");
            const memberCount = group._count.memberships;
            const fillPct = group.capacity ? Math.min(100, Math.round((memberCount / group.capacity) * 100)) : null;
            return (
              <Link key={group.id} href={`/groups/${group.id}`} className="group block">
                <Card padding="md" interactive className="h-full">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <p className="text-[16px] font-semibold text-ink group-hover:text-accent">{group.name}</p>
                    {group.isPublished ? <Badge variant="success">Listed</Badge> : <Badge>Unlisted</Badge>}
                  </div>
                  <p className="mb-3 text-sm text-ink-muted">
                    {groupTypeLabel(group.type)}
                    {leaders ? ` · Led by ${leaders}` : ""}
                  </p>
                  <div className="space-y-1.5 text-sm text-ink-secondary">
                    {group.meetingSchedule && (
                      <p className="flex items-center gap-1.5">
                        <CalendarClock size={14} className="text-ink-muted" /> {group.meetingSchedule}
                      </p>
                    )}
                    {group.meetingLocation && (
                      <p className="flex items-center gap-1.5">
                        <MapPin size={14} className="text-ink-muted" /> {group.meetingLocation}
                      </p>
                    )}
                  </div>
                  <div className="mt-4">
                    <p className="mb-1.5 flex items-baseline justify-between text-sm">
                      <span className="text-ink">
                        {memberCount} {memberCount === 1 ? "member" : "members"}
                      </span>
                      {group.capacity ? <span className="text-xs text-ink-muted">of {group.capacity}</span> : null}
                    </p>
                    {fillPct !== null && (
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                        <div
                          className={`h-full rounded-full ${fillPct >= 100 ? "bg-warning" : "bg-accent"}`}
                          style={{ width: `${fillPct}%` }}
                        />
                      </div>
                    )}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-5 flex items-center justify-end gap-2 text-sm text-ink-secondary">
          <PageLink q={q} type={type} campus={campusId} page={page - 1} disabled={page <= 1} label="Previous" />
          <span className="text-ink-muted">
            Page {page} of {totalPages}
          </span>
          <PageLink q={q} type={type} campus={campusId} page={page + 1} disabled={page >= totalPages} label="Next" />
        </div>
      )}
    </div>
  );
}

async function GroupFinderLink({ publicSiteId }: { publicSiteId: string }) {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const finderUrl = `${proto}://${host}/g/${publicSiteId}`;
  return (
    <a
      href={finderUrl}
      target="_blank"
      rel="noreferrer"
      className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-dark"
      title="Published groups appear on your public group finder"
    >
      <ExternalLink size={14} /> Public group finder
    </a>
  );
}

function PageLink({
  q,
  type,
  campus,
  page,
  disabled,
  label,
}: {
  q?: string;
  type?: string;
  campus?: string;
  page: number;
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    return <span className="cursor-not-allowed px-3 py-1.5 text-ink-muted">{label}</span>;
  }
  const sp = new URLSearchParams();
  if (q) sp.set("q", q);
  if (type) sp.set("type", type);
  if (campus) sp.set("campus", campus);
  sp.set("page", String(page));
  return (
    <Link href={`/groups?${sp.toString()}`} className={buttonClasses("secondary", "sm")}>
      {label}
    </Link>
  );
}
