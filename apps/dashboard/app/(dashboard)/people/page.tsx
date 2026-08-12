import Link from "next/link";
import { BookmarkPlus, Contact, FileSpreadsheet, Lock, Mail, Pin, Search, Trash2, UserPlus } from "lucide-react";
import { campusService, peopleService, type MembershipStatus } from "@cms/database";
import { personDisplayName } from "@cms/database";
import { Avatar } from "../../../components/ui/Avatar";
import { Badge } from "../../../components/ui/Badge";
import { buttonClasses } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Input, Select } from "../../../components/ui/Input";
import { PageHeader } from "../../../components/ui/PageHeader";
import { membershipStatusLabel, membershipStatusTone } from "../../../lib/people-format";
import { canMessages } from "../../../lib/messages-access";
import { canPeople } from "../../../lib/people-access";
import { deletePersonFilterAction, savePersonFilterAction, togglePersonFilterPinAction } from "./actions";
import { getCurrentOrganization } from "../../../lib/session";

const PAGE_SIZE = 25;

/**
 * People (docs/design-system.md): a CRM, not a database table. Big obvious
 * search, one row of human-readable tabs, filters that read as chips, and
 * rows built around recognition — avatar, name, contact, household. All the
 * power (saved filters, campus scoping, pagination, email-these-people)
 * stays; it just stops looking like an admin panel.
 */

const TABS: { key: string; label: string; params: Record<string, string> }[] = [
  { key: "everyone", label: "Everyone", params: {} },
  { key: "new", label: "New", params: { tab: "new" } },
  { key: "members", label: "Members", params: { status: "MEMBER" } },
  { key: "attenders", label: "Attenders", params: { status: "ATTENDER" } },
  { key: "visitors", label: "Visitors", params: { status: "VISITOR" } },
];

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; campus?: string; tab?: string; page?: string }>;
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
        <PageHeader title="People" />
        <Card padding="md">
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
  const isNewTab = params.tab === "new";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const activeTab = isNewTab ? "new" : status === "MEMBER" ? "members" : status === "ATTENDER" ? "attenders" : status === "VISITOR" ? "visitors" : "everyone";

  const [campuses, savedFilters] = await Promise.all([
    campusService.listCampuses(organization.id),
    peopleService.listSavedPersonFilters(organization.id),
  ]);

  const opts = { search: q, status, campusId, ...(isNewTab ? { createdWithinDays: 30 } : {}) };
  const [people, total, totalAll] = await Promise.all([
    peopleService.listPeople(organization.id, { ...opts, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    peopleService.countPeople(organization.id, opts),
    peopleService.countPeople(organization.id),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(q || status || campusId);

  const tabHref = (tabParams: Record<string, string>) => {
    const sp = new URLSearchParams(tabParams);
    if (q) sp.set("q", q);
    if (campusId) sp.set("campus", campusId);
    const query = sp.toString();
    return query ? `/people?${query}` : "/people";
  };

  return (
    <div>
      <PageHeader
        title="People"
        subtitle={`${totalAll.toLocaleString()} ${totalAll === 1 ? "person" : "people"} in ${organization.name}`}
        actions={
          <>
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
                className={buttonClasses("secondary", "sm")}
              >
                <Mail size={15} /> {status || campusId ? "Email these people" : "Email people"}
              </Link>
            )}
            {canImport && (
              <Link href="/people/import" className={buttonClasses("secondary", "sm")}>
                <FileSpreadsheet size={15} /> Import
              </Link>
            )}
            {canManage && (
              <Link href="/people/new" className={buttonClasses("primary", "sm")}>
                <UserPlus size={15} /> Add person
              </Link>
            )}
          </>
        }
      />

      {/* The search is the front door — big and obvious. */}
      <form method="get" className="mb-5">
        {isNewTab && <input type="hidden" name="tab" value="new" />}
        {status && <input type="hidden" name="status" value={status} />}
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted" />
          <Input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search people…"
            aria-label="Search people"
            className="h-12 rounded-md pl-11 text-base shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
          />
        </div>
        {campusId && <input type="hidden" name="campus" value={campusId} />}
      </form>

      <div className="mb-5 flex flex-wrap items-center gap-x-1 gap-y-3">
        <div className="flex max-w-full items-center gap-1 overflow-x-auto" role="tablist" aria-label="People views">
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              href={tabHref(tab.params)}
              role="tab"
              aria-selected={activeTab === tab.key}
              className={`rounded-md px-3.5 py-1.5 text-sm transition-colors duration-180 ${
                activeTab === tab.key
                  ? "bg-surface font-semibold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                  : "font-medium text-ink-secondary hover:bg-black/[0.04] hover:text-ink"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        {campuses.length > 0 && (
          <form method="get" className="ml-auto">
            {q && <input type="hidden" name="q" value={q} />}
            {status && <input type="hidden" name="status" value={status} />}
            {isNewTab && <input type="hidden" name="tab" value="new" />}
            <Select name="campus" defaultValue={campusId ?? ""} className="w-44 py-2 text-sm" aria-label="Campus">
              <option value="">All campuses</option>
              {campuses.map((campus) => (
                <option key={campus.id} value={campus.id}>
                  {campus.name}
                </option>
              ))}
            </Select>
          </form>
        )}
      </div>

      {(savedFilters.length > 0 || hasFilters) && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {savedFilters.map((f) => {
            const config = f.config as { q?: string | null; status?: string | null; campusId?: string | null };
            const sp = new URLSearchParams();
            if (config.q) sp.set("q", config.q);
            if (config.status) sp.set("status", config.status);
            if (config.campusId) sp.set("campus", config.campusId);
            return (
              <span key={f.id} className="flex items-center overflow-hidden rounded-full border border-border bg-surface text-sm">
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
                  <button type="submit" aria-label={`Delete saved filter ${f.name}`} className="pr-2 text-ink-muted hover:text-danger">
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
              <Input name="name" required placeholder="Name this view" className="w-44 py-2 text-sm" />
              <button type="submit" className={buttonClasses("secondary", "sm")}>
                <BookmarkPlus size={14} /> Save view
              </button>
            </form>
          )}
        </div>
      )}

      {people.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<Contact size={22} />}
            title={hasFilters || isNewTab ? "No people match" : "Every person, one place"}
            description={
              hasFilters || isNewTab
                ? "Try a different search or view."
                : "Add your first person to start building your church's relationship graph — households, groups, giving, and follow-ups all connect here."
            }
            action={
              canManage && !hasFilters && !isNewTab ? (
                <Link href="/people/new" className={buttonClasses("primary", "sm")}>
                  <UserPlus size={15} /> Add person
                </Link>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card padding="none" data-section="people-list">
          <ul className="divide-y divide-border">
            {people.map((person) => (
              <li key={person.id}>
                <Link
                  href={`/people/${person.id}`}
                  className="flex min-h-[68px] items-center gap-4 px-5 py-3 transition-colors duration-180 hover:bg-surface-muted"
                >
                  <Avatar name={personDisplayName(person)} photoUrl={person.photoUrl} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium text-ink">{personDisplayName(person)}</p>
                    <p className="truncate text-sm text-ink-muted">
                      {[person.email, person.phone].filter(Boolean).join(" · ") || "No contact info"}
                    </p>
                  </div>
                  <div className="hidden min-w-0 max-w-[180px] shrink-0 sm:block">
                    <p className="truncate text-sm text-ink-secondary">{person.household?.name ?? ""}</p>
                  </div>
                  <Badge variant={membershipStatusTone(person.membershipStatus)}>
                    {membershipStatusLabel(person.membershipStatus)}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mt-4 flex items-center justify-between text-sm text-ink-secondary">
        <span>
          {total} {total === 1 ? "person" : "people"}
          {activeTab !== "everyone" ? " in this view" : ""}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <PageLink params={params} page={page - 1} disabled={page <= 1} label="Previous" />
            <span className="text-ink-muted">
              Page {page} of {totalPages}
            </span>
            <PageLink params={params} page={page + 1} disabled={page >= totalPages} label="Next" />
          </div>
        )}
      </div>
    </div>
  );
}

function PageLink({
  params,
  page,
  disabled,
  label,
}: {
  params: { q?: string; status?: string; campus?: string; tab?: string };
  page: number;
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    return <span className="cursor-not-allowed px-3 py-1.5 text-ink-muted">{label}</span>;
  }
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.status) sp.set("status", params.status);
  if (params.campus) sp.set("campus", params.campus);
  if (params.tab) sp.set("tab", params.tab);
  sp.set("page", String(page));
  return (
    <Link href={`/people?${sp.toString()}`} className={buttonClasses("secondary", "sm")}>
      {label}
    </Link>
  );
}
