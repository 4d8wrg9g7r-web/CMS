import Link from "next/link";
import { BookmarkPlus, Contact, FileSpreadsheet, Lock, Mail, Pin, Search, Trash2, UserPlus } from "lucide-react";
import { campusService, peopleService, type MembershipStatus } from "@cms/database";
import { personDisplayName } from "@cms/database";
import { Badge } from "../../../components/ui/Badge";
import { buttonClasses } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Input, Select } from "../../../components/ui/Input";
import { MEMBERSHIP_STATUS_OPTIONS, membershipStatusLabel, membershipStatusTone } from "../../../lib/people-format";
import { canMessages } from "../../../lib/messages-access";
import { canPeople } from "../../../lib/people-access";
import {
  deletePersonFilterAction,
  savePersonFilterAction,
  togglePersonFilterPinAction,
} from "./actions";
import { getCurrentOrganization } from "../../../lib/session";

const PAGE_SIZE = 25;

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; campus?: string; page?: string }>;
}) {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  // Server-side authorization: People data is Confidential; only roles the matrix
  // grants person.view get past here (BLUEPRINT §34 -- never authorization-by-UI).
  const [canView, canManage, canImport, canEmail] = await Promise.all([
    canPeople(organization.id, "person.view"),
    canPeople(organization.id, "person.manage"),
    canPeople(organization.id, "person.import"),
    canMessages(organization.id, "message.manage"),
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
  const campusId = params.campus || undefined;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const [campuses, savedFilters] = await Promise.all([
    campusService.listCampuses(organization.id),
    peopleService.listSavedPersonFilters(organization.id),
  ]);

  const opts = { search: q, status, campusId };
  const [people, total] = await Promise.all([
    peopleService.listPeople(organization.id, { ...opts, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    peopleService.countPeople(organization.id, opts),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(q || status || campusId);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-2xl font-semibold tracking-tight text-ink">People</h1>
          <p className="text-sm text-ink-secondary">
            The canonical record for everyone {organization.name} ministers to.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEmail && (
            <Link
              // Carries the current status/campus filters into the composer as a
              // prefilled audience — the free-text search box has no audience
              // equivalent, so it stays behind.
              href={`/messages/new?${new URLSearchParams({
                ...(status || campusId ? { audienceKind: "filter" } : {}),
                ...(status ? { membershipStatus: status } : {}),
                ...(campusId ? { campusId } : {}),
              }).toString()}`}
              className={buttonClasses("secondary", "md")}
            >
              <Mail size={16} /> {status || campusId ? "Email these people" : "Email people"}
            </Link>
          )}
          {canImport && (
            <Link href="/people/import" className={buttonClasses("secondary", "md")}>
              <FileSpreadsheet size={16} /> Import CSV
            </Link>
          )}
          {canManage && (
            <Link href="/people/new" className={buttonClasses("primary", "md")}>
              <UserPlus size={16} /> Add person
            </Link>
          )}
        </div>
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
          {campuses.length > 0 && (
            <label className="text-sm text-ink-secondary">
              Campus
              <Select name="campus" defaultValue={campusId ?? ""} className="mt-1 w-44">
                <option value="">All campuses</option>
                {campuses.map((campus) => (
                  <option key={campus.id} value={campus.id}>
                    {campus.name}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <button type="submit" className={buttonClasses("secondary", "md")}>
            Apply
          </button>
        </form>

        {(savedFilters.length > 0 || hasFilters) && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Saved filters</span>
            {savedFilters.map((f) => {
              const config = f.config as { q?: string | null; status?: string | null; campusId?: string | null };
              const sp = new URLSearchParams();
              if (config.q) sp.set("q", config.q);
              if (config.status) sp.set("status", config.status);
              if (config.campusId) sp.set("campus", config.campusId);
              return (
                <span
                  key={f.id}
                  className="flex items-center overflow-hidden rounded-full border border-border bg-surface text-sm"
                >
                  <Link href={`/people?${sp.toString()}`} className="px-3 py-1 font-medium text-ink hover:bg-surface-muted">
                    {f.name}
                  </Link>
                  <form action={togglePersonFilterPinAction.bind(null, f.id, !f.pinned)} className="flex">
                    <button
                      type="submit"
                      aria-label={f.pinned ? `Unpin ${f.name} from the dashboard` : `Pin ${f.name} to the dashboard`}
                      title={f.pinned ? "Unpin from dashboard" : "Pin to dashboard"}
                      className={`pr-1.5 ${f.pinned ? "text-accent" : "text-ink-muted hover:text-ink"}`}
                    >
                      <Pin size={13} fill={f.pinned ? "currentColor" : "none"} />
                    </button>
                  </form>
                  <form action={deletePersonFilterAction.bind(null, f.id)} className="flex">
                    <button
                      type="submit"
                      aria-label={`Delete saved filter ${f.name}`}
                      className="pr-2 text-ink-muted hover:text-danger"
                    >
                      <Trash2 size={13} />
                    </button>
                  </form>
                </span>
              );
            })}
            {hasFilters && (
              <form action={savePersonFilterAction} className="ml-auto flex items-center gap-2">
                {q && <input type="hidden" name="q" value={q} />}
                {status && <input type="hidden" name="status" value={status} />}
                {campusId && <input type="hidden" name="campusId" value={campusId} />}
                <Input name="name" required placeholder="Name this filter" className="w-44" />
                <button type="submit" className={buttonClasses("secondary", "sm")}>
                  <BookmarkPlus size={14} /> Save filter
                </button>
              </form>
            )}
          </div>
        )}
      </Card>

      {people.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<Contact size={22} />}
            title={hasFilters ? "No people match your filters" : "No people yet"}
            description={
              hasFilters
                ? "Try a different search or filter."
                : "Add your first person to start building your church's relationship graph."
            }
            action={
              canManage && !hasFilters ? (
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
            <PageLink q={q} status={status} campus={campusId} page={page - 1} disabled={page <= 1} label="Previous" />
            <span className="text-ink-muted">
              Page {page} of {totalPages}
            </span>
            <PageLink q={q} status={status} campus={campusId} page={page + 1} disabled={page >= totalPages} label="Next" />
          </div>
        )}
      </div>
    </div>
  );
}

function PageLink({
  q,
  status,
  campus,
  page,
  disabled,
  label,
}: {
  q?: string;
  status?: string;
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
  if (status) sp.set("status", status);
  if (campus) sp.set("campus", campus);
  sp.set("page", String(page));
  return (
    <Link href={`/people?${sp.toString()}`} className={buttonClasses("secondary", "sm")}>
      {label}
    </Link>
  );
}
