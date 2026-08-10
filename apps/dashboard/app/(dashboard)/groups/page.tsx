import Link from "next/link";
import { headers } from "next/headers";
import { ExternalLink, Lock, Plus, Users2 } from "lucide-react";
import { groupService, type GroupType } from "@cms/database";
import { Badge } from "../../../components/ui/Badge";
import { buttonClasses } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Input, Select } from "../../../components/ui/Input";
import { GROUP_TYPE_OPTIONS, groupTypeLabel } from "../../../lib/groups-format";
import { canGroups } from "../../../lib/groups-access";
import { getCurrentOrganization } from "../../../lib/session";

const PAGE_SIZE = 25;

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; page?: string }>;
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
        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-ink">Groups</h1>
        <Card padding="md" className="mt-6">
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
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const opts = { search: q, type };
  const [groups, total] = await Promise.all([
    groupService.listGroups(organization.id, { ...opts, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    groupService.countGroups(organization.id, opts),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-2xl font-semibold tracking-tight text-ink">Groups</h1>
          <p className="text-sm text-ink-secondary">Small groups, classes, and teams at {organization.name}.</p>
        </div>
        {canManage && (
          <Link href="/groups/new" className={buttonClasses("primary", "md")}>
            <Plus size={16} /> New group
          </Link>
        )}
      </div>

      <GroupFinderLink publicSiteId={organization.publicSiteId} />

      <Card padding="sm" className="mb-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-ink-secondary">
            Search
            <Input name="q" defaultValue={q ?? ""} placeholder="Group name" className="mt-1 w-64" />
          </label>
          <label className="text-sm text-ink-secondary">
            Type
            <Select name="type" defaultValue={type ?? ""} className="mt-1 w-48">
              <option value="">All types</option>
              {GROUP_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </label>
          <button type="submit" className={buttonClasses("secondary", "md")}>
            Apply
          </button>
        </form>
      </Card>

      {groups.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<Users2 size={22} />}
            title={q || type ? "No groups match your filters" : "No groups yet"}
            description={
              q || type ? "Try a different search or type." : "Create your first group to organize people into community."
            }
            action={
              canManage && !q && !type ? (
                <Link href="/groups/new" className={buttonClasses("primary", "sm")}>
                  <Plus size={15} /> New group
                </Link>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Members</th>
                  <th className="px-5 py-3 font-medium">Schedule</th>
                  <th className="px-5 py-3 font-medium">Visibility</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.id} className="border-b border-border/60 last:border-0 hover:bg-surface-muted">
                    <td className="px-5 py-3">
                      <Link href={`/groups/${group.id}`} className="font-medium text-ink hover:text-accent">
                        {group.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">{groupTypeLabel(group.type)}</td>
                    <td className="px-5 py-3 text-ink-secondary">
                      {group._count.memberships}
                      {group.capacity ? ` / ${group.capacity}` : ""}
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">{group.meetingSchedule ?? "—"}</td>
                    <td className="px-5 py-3">
                      {group.isPublished ? <Badge variant="success">Published</Badge> : <Badge>Unlisted</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="mt-4 flex items-center justify-between text-sm text-ink-secondary">
        <span>
          {total} {total === 1 ? "group" : "groups"}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <PageLink q={q} type={type} page={page - 1} disabled={page <= 1} label="Previous" />
            <span className="text-ink-muted">
              Page {page} of {totalPages}
            </span>
            <PageLink q={q} type={type} page={page + 1} disabled={page >= totalPages} label="Next" />
          </div>
        )}
      </div>
    </div>
  );
}

async function GroupFinderLink({ publicSiteId }: { publicSiteId: string }) {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const finderUrl = `${proto}://${host}/g/${publicSiteId}`;
  return (
    <Card padding="sm" className="mb-4">
      <p className="flex flex-wrap items-center gap-2 text-sm text-ink-secondary">
        <Users2 size={15} className="text-ink-muted" />
        Public group finder (published groups only):
        <a href={finderUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-accent hover:underline">
          <ExternalLink size={13} /> {finderUrl}
        </a>
      </p>
    </Card>
  );
}

function PageLink({
  q,
  type,
  page,
  disabled,
  label,
}: {
  q?: string;
  type?: string;
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
  sp.set("page", String(page));
  return (
    <Link href={`/groups?${sp.toString()}`} className={buttonClasses("secondary", "sm")}>
      {label}
    </Link>
  );
}
