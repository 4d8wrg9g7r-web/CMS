import Link from "next/link";
import { Contact, Lock, Search, UserPlus } from "lucide-react";
import { peopleService, type MembershipStatus } from "@cms/database";
import { personDisplayName } from "@cms/database";
import { Badge } from "../../../components/ui/Badge";
import { buttonClasses } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Input, Select } from "../../../components/ui/Input";
import { MEMBERSHIP_STATUS_OPTIONS, membershipStatusLabel, membershipStatusTone } from "../../../lib/people-format";
import { canPeople } from "../../../lib/people-access";
import { getCurrentOrganization } from "../../../lib/session";

const PAGE_SIZE = 25;

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  // Server-side authorization: People data is Confidential; only roles the matrix
  // grants person.view get past here (BLUEPRINT §34 -- never authorization-by-UI).
  const [canView, canManage] = await Promise.all([
    canPeople(organization.id, "person.view"),
    canPeople(organization.id, "person.manage"),
  ]);

  if (!canView) {
    return (
      <div>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-ink">People</h1>
        <Card padding="md" className="mt-6">
          <EmptyState
            icon={<Lock size={22} />}
            title="You don't have access to People"
            description="Person and household records are restricted to organization owners and admins. Ask an owner if you need access."
          />
        </Card>
      </div>
    );
  }

  const params = await searchParams;
  const q = params.q?.trim() || undefined;
  const status = (params.status as MembershipStatus | undefined) || undefined;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const opts = { search: q, status };
  const [people, total] = await Promise.all([
    peopleService.listPeople(organization.id, { ...opts, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    peopleService.countPeople(organization.id, opts),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-2xl font-semibold tracking-tight text-ink">People</h1>
          <p className="text-sm text-ink-secondary">
            The canonical record for everyone {organization.name} ministers to.
          </p>
        </div>
        {canManage && (
          <Link href="/people/new" className={buttonClasses("primary", "md")}>
            <UserPlus size={16} /> Add person
          </Link>
        )}
      </div>

      <Card padding="sm" className="mb-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-ink-secondary">
            Search
            <div className="relative mt-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <Input name="q" defaultValue={q ?? ""} placeholder="Name or email" className="w-64 pl-9" />
            </div>
          </label>
          <label className="text-sm text-ink-secondary">
            Status
            <Select name="status" defaultValue={status ?? ""} className="mt-1 w-44">
              <option value="">All statuses</option>
              {MEMBERSHIP_STATUS_OPTIONS.map((o) => (
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

      {people.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<Contact size={22} />}
            title={q || status ? "No people match your filters" : "No people yet"}
            description={
              q || status
                ? "Try a different search or status filter."
                : "Add your first person to start building your church's relationship graph."
            }
            action={
              canManage && !q && !status ? (
                <Link href="/people/new" className={buttonClasses("primary", "sm")}>
                  <UserPlus size={15} /> Add person
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
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-5 py-3 font-medium">Phone</th>
                  <th className="px-5 py-3 font-medium">Household</th>
                </tr>
              </thead>
              <tbody>
                {people.map((person) => (
                  <tr key={person.id} className="border-b border-border/60 last:border-0 hover:bg-surface-muted">
                    <td className="px-5 py-3">
                      <Link href={`/people/${person.id}`} className="font-medium text-ink hover:text-accent">
                        {personDisplayName(person)}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={membershipStatusTone(person.membershipStatus)}>
                        {membershipStatusLabel(person.membershipStatus)}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">{person.email ?? "—"}</td>
                    <td className="px-5 py-3 text-ink-secondary">{person.phone ?? "—"}</td>
                    <td className="px-5 py-3 text-ink-secondary">{person.household?.name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="mt-4 flex items-center justify-between text-sm text-ink-secondary">
        <span>
          {total} {total === 1 ? "person" : "people"}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <PageLink q={q} status={status} page={page - 1} disabled={page <= 1} label="Previous" />
            <span className="text-ink-muted">
              Page {page} of {totalPages}
            </span>
            <PageLink q={q} status={status} page={page + 1} disabled={page >= totalPages} label="Next" />
          </div>
        )}
      </div>
    </div>
  );
}

function PageLink({
  q,
  status,
  page,
  disabled,
  label,
}: {
  q?: string;
  status?: string;
  page: number;
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    return <span className="cursor-not-allowed px-3 py-1.5 text-ink-muted">{label}</span>;
  }
  const sp = new URLSearchParams();
  if (q) sp.set("q", q);
  if (status) sp.set("status", status);
  sp.set("page", String(page));
  return (
    <Link href={`/people?${sp.toString()}`} className={buttonClasses("secondary", "sm")}>
      {label}
    </Link>
  );
}
