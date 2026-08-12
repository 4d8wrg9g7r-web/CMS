import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BellRing, CheckSquare, FileText, HeartHandshake, Home, Link2, Mail, MailX, Map, Paperclip, Smartphone, Trash2, Undo2, Users2, X, Zap } from "lucide-react";
import { appActivityService, checkinService, fileService, formatFieldValue, givingService, groupService, isOverdue, journeyService, messageService, peopleService, personDisplayName, taskService, volunteerService } from "@cms/database";
import { campusService } from "@cms/database";
import { SubmitButton } from "../../../../components/SubmitButton";
import { Avatar } from "../../../../components/ui/Avatar";
import { Badge } from "../../../../components/ui/Badge";
import { buttonClasses } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { Input, Select } from "../../../../components/ui/Input";
import { PersonForm } from "../../../../components/PersonForm";
import {
  HOUSEHOLD_ROLE_OPTIONS,
  RELATIONSHIP_TYPE_OPTIONS,
  householdRoleLabel,
  membershipStatusLabel,
  membershipStatusTone,
  relationshipTypeLabel,
} from "../../../../lib/people-format";
import { canPeople, requirePeople } from "../../../../lib/people-access";
import { canGroups } from "../../../../lib/groups-access";
import { canTasks } from "../../../../lib/tasks-access";
import { canJourneys } from "../../../../lib/journeys-access";
import { canMessages } from "../../../../lib/messages-access";
import { canCheckin } from "../../../../lib/checkin-access";
import { canVolunteers } from "../../../../lib/volunteers-access";
import { canFiles } from "../../../../lib/files-access";
import { canGiving } from "../../../../lib/giving-access";
import { grantQualificationAction, revokeQualificationAction } from "../../serving/actions";
import { archivePersonFileAction, uploadPersonFileAction } from "./file-actions";
import { groupTypeLabel } from "../../../../lib/groups-format";
import { getCurrentOrganization } from "../../../../lib/session";
import {
  addRelationshipAction,
  archivePersonAction,
  removeRelationshipAction,
  restorePersonAction,
  setEmailOptOutAction,
  setHouseholdAction,
  updatePersonAction,
  updatePersonFieldsAction,
} from "../actions";

/**
 * The person profile (docs/design-system.md "Detail pages"): a human-centered
 * page, not a database dump. Identity header first, then tabs — Overview
 * answers "what should I know about this person?", Activity is the unified
 * timeline across every module, Details holds the full editable record. All
 * panels keep their original per-module permission gates; the giving summary
 * additionally requires giving.view.
 */

type Tab = "overview" | "activity" | "details" | "serving" | "files";

interface TimelineEntry {
  at: Date;
  label: string;
  detail?: string | null;
  href?: string | null;
}

export default async function PersonDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ personId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const organization = await getCurrentOrganization();
  if (!organization) return null;
  await requirePeople(organization.id, "person.view");
  const canManage = await canPeople(organization.id, "person.manage");

  const { personId } = await params;
  const { tab: rawTab } = await searchParams;
  const person = await peopleService.getPerson(organization.id, personId);
  if (!person) notFound();

  const tab: Tab = (["overview", "activity", "details", "serving", "files"] as const).includes(rawTab as Tab)
    ? (rawTab as Tab)
    : "overview";

  const [campuses, households, allPeople] = await Promise.all([
    campusService.listCampuses(organization.id),
    peopleService.listHouseholds(organization.id),
    // v1: a bounded select rather than autocomplete. 200 is well past any small church's
    // roster; larger orgs get search-based relationship linking in a later iteration.
    peopleService.listPeople(organization.id, { take: 200 }),
  ]);
  const otherPeople = allPeople.filter((p) => p.id !== person.id);

  // Per-module permission gates — identical to the pre-redesign page.
  const [canViewGroups, canViewTasks, canViewJourneys, canViewMessages, canViewCheckins, canViewFiles, canManageFiles, canViewServing, canManageServing, canViewGiving] =
    await Promise.all([
      canGroups(organization.id, "group.view"),
      canTasks(organization.id, "task.view"),
      canJourneys(organization.id, "journey.view"),
      canMessages(organization.id, "message.view"),
      canCheckin(organization.id, "checkin.view"),
      canFiles(organization.id, "file.view"),
      canFiles(organization.id, "file.manage"),
      canVolunteers(organization.id, "volunteer.view"),
      canVolunteers(organization.id, "volunteer.manage"),
      canGiving(organization.id, "giving.view"),
    ]);

  const [groupMemberships, personTasks, personJourneys, personMessages, personCheckIns, personFiles, personGifts] =
    await Promise.all([
      canViewGroups ? groupService.listGroupsForPerson(organization.id, person.id) : [],
      canViewTasks ? taskService.listTasksForPerson(organization.id, person.id) : [],
      canViewJourneys ? journeyService.listEnrollmentsForPerson(organization.id, person.id) : [],
      canViewMessages ? messageService.listMessagesForPerson(organization.id, person.id, 8) : [],
      canViewCheckins ? checkinService.listCheckInsForPerson(organization.id, person.id, 10) : [],
      canViewFiles ? fileService.listFilesForPerson(organization.id, person.id) : [],
      canViewGiving ? givingService.listContributionsForPerson(organization.id, person.id, 10) : [],
    ]);

  const [personServing, personQualifications] = canViewServing
    ? await Promise.all([
        volunteerService.listServingForPerson(organization.id, person.id),
        volunteerService.listQualificationsForPerson(organization.id, person.id),
      ])
    : [[], []];

  // Church-app engagement (docs/domain/app.md). Staff-only by construction:
  // this page sits behind staff auth + person.view, and the activity service is
  // never wired into the member-facing app API — members can't read each
  // other's activity. Group-sourced items (prayer requests, RSVPs, votes)
  // additionally require group.view, matching the group-space permission ladder.
  const appActivityRaw = await appActivityService.getPersonAppActivity(organization.id, person.id);
  const appActivity = canViewGroups
    ? appActivityRaw
    : {
        ...appActivityRaw,
        timeline: appActivityRaw.timeline.filter((item) => !item.kind.startsWith("group") && item.kind !== "poll_vote"),
        counts: { ...appActivityRaw.counts, groupPosts: 0, rsvps: 0, pollVotes: 0 },
      };

  // The unified timeline: one stream across attendance, communications,
  // giving, and app engagement — each source already permission-filtered above.
  const timeline: TimelineEntry[] = [
    ...personCheckIns.map((c) => ({
      at: new Date(c.occurrenceAt),
      label: `Checked into ${c.event.title}`,
      href: `/events/${c.eventId}`,
    })),
    ...personMessages.map((m) => ({
      at: new Date(m.sentAt ?? m.createdAt),
      label: `Received “${m.subject}”`,
      detail: m.status.toLowerCase(),
    })),
    ...personGifts.map((g) => ({
      at: new Date(g.receivedAt),
      label: `Gave ${(g.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}`,
      detail: g.fund?.name ?? null,
    })),
    ...appActivity.timeline.map((item) => ({
      at: new Date(item.at),
      label: item.label,
      detail: [item.groupName, item.detail].filter(Boolean).join(" · ") || null,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const givingYearCents = personGifts
    .filter((g) => new Date(g.receivedAt).getFullYear() === new Date().getFullYear())
    .reduce((sum, g) => sum + g.amountCents, 0);

  const lastContactAt = personMessages[0] ? new Date(personMessages[0].sentAt ?? personMessages[0].createdAt) : null;

  const boundUpdate = updatePersonAction.bind(null, person.id);
  const boundSetHousehold = setHouseholdAction.bind(null, person.id);
  const boundAddRelationship = addRelationshipAction.bind(null, person.id);
  const boundArchive = archivePersonAction.bind(null, person.id);
  const boundRestore = restorePersonAction.bind(null, person.id);
  const boundUpdateFields = updatePersonFieldsAction.bind(null, person.id);

  // Custom fields (docs/domain/people.md "Custom fields"): every active definition
  // renders, valued or not — unlimited per org.
  const fieldDefinitions = await peopleService.listFieldDefinitions(organization.id);
  // Plain object, not a Map — the lucide-react `Map` icon import shadows the global.
  const valueByFieldId: Record<string, unknown> = Object.fromEntries(person.fieldValues.map((v) => [v.fieldId, v.value]));

  const name = personDisplayName(person);

  const TABS: { key: Tab; label: string; show: boolean }[] = [
    { key: "overview", label: "Overview", show: true },
    { key: "activity", label: "Activity", show: true },
    { key: "details", label: "Details", show: true },
    { key: "serving", label: "Serving", show: canViewServing },
    { key: "files", label: "Files", show: canViewFiles },
  ];

  const tabHref = (key: Tab) => (key === "overview" ? `/people/${person.id}` : `/people/${person.id}?tab=${key}`);

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/people" className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
        <ArrowLeft size={15} /> People
      </Link>

      {/* Identity header: who this is, how to reach them, what to do next. */}
      <div className="mb-6 flex flex-wrap items-center gap-5">
        <Avatar name={name} photoUrl={person.photoUrl} size={72} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-display text-[28px] leading-tight text-ink">{name}</h1>
            <Badge variant={membershipStatusTone(person.membershipStatus)}>{membershipStatusLabel(person.membershipStatus)}</Badge>
            {person.archivedAt && <Badge variant="warning">Archived</Badge>}
          </div>
          <p className="mt-1 truncate text-[15px] text-ink-secondary">
            {[person.email, person.phone].filter(Boolean).join(" · ") || "No contact info yet"}
          </p>
          <p className="mt-0.5 truncate text-sm text-ink-muted">
            {[
              person.campus?.name,
              person.household?.name,
              `Added ${new Date(person.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex basis-full items-center gap-2 sm:basis-auto">
          {person.email && (
            <a href={`mailto:${person.email}`} className={buttonClasses("secondary", "sm")}>
              <Mail size={15} /> Email
            </a>
          )}
          {canViewTasks && (
            <Link href={`/tasks?person=${person.id}`} className={buttonClasses("secondary", "sm")}>
              <CheckSquare size={15} /> Tasks
            </Link>
          )}
        </div>
      </div>

      <nav className="mb-8 flex items-center gap-1 overflow-x-auto border-b border-border" aria-label="Profile sections">
        {TABS.filter((t) => t.show).map((t) => (
          <Link
            key={t.key}
            href={tabHref(t.key)}
            aria-current={tab === t.key ? "page" : undefined}
            className={`-mb-px border-b-2 px-3.5 py-2.5 text-sm transition-colors duration-180 ${
              tab === t.key
                ? "border-accent font-semibold text-ink"
                : "border-transparent font-medium text-ink-secondary hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {/* ------------------------------- Overview ------------------------------- */}
      {tab === "overview" && (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="flex flex-col gap-5 lg:col-span-2">
            {/* Follow-up posture — the first question a staffer asks. */}
            {(canViewTasks || canViewMessages) && (
              <Card padding="md" data-card="follow-up">
                <h2 className="mb-3 text-sm font-semibold text-ink">Follow-up</h2>
                <div className="flex flex-wrap gap-x-8 gap-y-3">
                  {canViewMessages && (
                    <div>
                      <p className="text-xs uppercase tracking-wide text-ink-muted">Last contacted</p>
                      <p className="mt-0.5 text-[15px] text-ink">
                        {lastContactAt
                          ? lastContactAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                          : "Never"}
                      </p>
                    </div>
                  )}
                  {canViewTasks && (
                    <div>
                      <p className="text-xs uppercase tracking-wide text-ink-muted">Open tasks</p>
                      {personTasks.length === 0 ? (
                        <p className="mt-0.5 text-[15px] text-ink">None</p>
                      ) : (
                        <ul className="mt-0.5 space-y-1">
                          {personTasks.slice(0, 3).map((task) => (
                            <li key={task.id} className="text-[15px] text-ink">
                              {task.title}
                              {task.workflowRunId && <Zap size={11} className="ml-1.5 inline text-accent" />}
                              {task.dueAt && (
                                <span className={`ml-2 text-xs ${isOverdue(task) ? "font-medium text-danger" : "text-ink-muted"}`}>
                                  due {new Date(task.dueAt).toLocaleDateString()}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  {person.emailOptedOutAt && (
                    <p className="flex items-center gap-1.5 self-end rounded-md bg-warning-bg px-3 py-1.5 text-xs text-warning">
                      <MailX size={13} /> Opted out of email
                    </p>
                  )}
                </div>
              </Card>
            )}

            {/* Journeys — where they are on the pathway. */}
            {canViewJourneys && personJourneys.length > 0 && (
              <Card padding="md">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                  <Map size={15} /> Journey
                </h2>
                <ul className="space-y-3">
                  {personJourneys.map((enrollment) => (
                    <li key={enrollment.id} className="text-sm">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <Link href={`/journeys/${enrollment.journeyId}`} className="text-[15px] text-ink hover:text-accent">
                          {enrollment.journey.name}
                        </Link>
                        <span className="text-xs text-ink-muted">
                          {enrollment.status === "COMPLETED"
                            ? "Completed"
                            : enrollment.status === "EXITED"
                              ? "Exited"
                              : enrollment.progress.nextMilestone
                                ? `Next: ${enrollment.progress.nextMilestone.name}`
                                : `${enrollment.progress.percent}%`}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${enrollment.progress.percent}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {/* Recent activity — the top of the unified timeline. */}
            <Card padding="md" data-card="recent-activity">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ink">Recent activity</h2>
                <Link href={tabHref("activity")} className="text-xs font-medium text-accent hover:text-accent-dark">
                  Full timeline →
                </Link>
              </div>
              {timeline.length === 0 ? (
                <p className="text-sm text-ink-muted">Nothing recorded yet — activity from services, giving, messages, and the app shows up here.</p>
              ) : (
                <Timeline entries={timeline.slice(0, 6)} />
              )}
            </Card>
          </div>

          <div className="flex flex-col gap-5">
            {/* Household */}
            <Card padding="md">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                <Home size={15} /> Household
              </h2>
              {person.household ? (
                <div>
                  <p className="text-sm font-medium text-ink">{person.household.name}</p>
                  <p className="text-xs text-ink-muted">{householdRoleLabel(person.householdRole)}</p>
                  <ul className="mt-2 space-y-1.5 text-sm text-ink-secondary">
                    {person.household.members.map((m) => (
                      <li key={m.id}>
                        {m.id === person.id ? (
                          <span className="text-ink">{personDisplayName(m)}</span>
                        ) : (
                          <Link href={`/people/${m.id}`} className="hover:text-accent">
                            {personDisplayName(m)}
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-ink-muted">Not in a household.</p>
              )}
            </Card>

            {/* Groups -- read-only; composes the Group module via GroupMembership. */}
            {canViewGroups && (
              <Card padding="md">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                  <Users2 size={15} /> Groups
                </h2>
                {groupMemberships.length === 0 ? (
                  <p className="text-sm text-ink-muted">Not in any groups.</p>
                ) : (
                  <ul className="space-y-2">
                    {groupMemberships.map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                        <Link href={`/groups/${m.group.id}`} className="text-ink hover:text-accent">
                          {m.group.name}
                        </Link>
                        <span className="text-xs text-ink-muted">{groupTypeLabel(m.group.type)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {/* Giving summary — giving.view only; detail lives in Giving. */}
            {canViewGiving && (
              <Card padding="md" data-card="giving-summary">
                <h2 className="mb-3 text-sm font-semibold text-ink">Giving</h2>
                {personGifts.length === 0 ? (
                  <p className="text-sm text-ink-muted">No recorded gifts.</p>
                ) : (
                  <div>
                    <p className="text-metric text-2xl text-ink">
                      {(givingYearCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
                    </p>
                    <p className="text-xs text-ink-muted">this year · last gift {new Date(personGifts[0]!.receivedAt).toLocaleDateString()}</p>
                  </div>
                )}
              </Card>
            )}

            {/* App engagement chips. */}
            {(appActivity.lastSignInAt !== null || appActivity.pushEnabled) && (
              <Card padding="md" data-section="app-activity">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                  <Smartphone size={15} /> Church app
                </h2>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                  {appActivity.lastSignInAt ? (
                    <span>Last sign-in {new Date(appActivity.lastSignInAt).toLocaleDateString()}</span>
                  ) : (
                    <span>Hasn&rsquo;t signed in yet</span>
                  )}
                  {appActivity.pushEnabled && (
                    <span className="inline-flex items-center gap-1 text-accent">
                      <BellRing size={11} /> Push on
                    </span>
                  )}
                  {appActivity.counts.feedPosts + appActivity.counts.groupPosts > 0 && (
                    <span>{appActivity.counts.feedPosts + appActivity.counts.groupPosts} posts</span>
                  )}
                  {appActivity.counts.rsvps > 0 && <span>{appActivity.counts.rsvps} RSVPs</span>}
                </p>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------- Activity ------------------------------- */}
      {tab === "activity" && (
        <Card padding="md" className="max-w-3xl">
          <h2 className="mb-4 text-sm font-semibold text-ink">Timeline</h2>
          {timeline.length === 0 ? (
            <p className="text-sm text-ink-muted">Nothing recorded yet — check-ins, gifts, messages, and app activity all land here.</p>
          ) : (
            <Timeline entries={timeline} />
          )}
        </Card>
      )}

      {/* ------------------------------- Details ------------------------------- */}
      {tab === "details" && (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card padding="md">
              <h2 className="mb-4 text-sm font-semibold text-ink">Profile</h2>
              {canManage ? (
                <PersonForm
                  action={boundUpdate}
                  person={person}
                  campuses={campuses.map((c) => ({ id: c.id, name: c.name }))}
                  submitLabel="Save changes"
                />
              ) : (
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <ReadField label="Email" value={person.email} />
                  <ReadField label="Phone" value={person.phone} />
                  <ReadField label="Preferred name" value={person.preferredName} />
                  <ReadField label="Home campus" value={person.campus?.name} />
                  <ReadField label="Tags" value={person.tags.join(", ") || null} />
                  <ReadField label="Notes" value={person.notes} />
                </dl>
              )}
            </Card>

            {fieldDefinitions.length > 0 && (
              <Card padding="md" className="mt-5">
                <h2 className="mb-4 text-sm font-semibold text-ink">Details</h2>
                {canManage ? (
                  <form action={boundUpdateFields} className="grid gap-3 sm:grid-cols-2">
                    {fieldDefinitions.map((def) => {
                      const value = valueByFieldId[def.id];
                      const name = `field:${def.key}`;
                      return (
                        <label key={def.id} className="text-sm font-medium text-ink-secondary">
                          {def.label}
                          {def.type === "BOOLEAN" && (
                            <Select name={name} defaultValue={value === true ? "true" : value === false ? "false" : ""} className="mt-1 block w-full">
                              <option value="">—</option>
                              <option value="true">Yes</option>
                              <option value="false">No</option>
                            </Select>
                          )}
                          {def.type === "SELECT" && (
                            <Select name={name} defaultValue={typeof value === "string" ? value : ""} className="mt-1 block w-full">
                              <option value="">—</option>
                              {def.options.map((o) => (
                                <option key={o} value={o}>
                                  {o}
                                </option>
                              ))}
                            </Select>
                          )}
                          {def.type === "MULTI_SELECT" && (
                            <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                              {def.options.map((o) => (
                                <label key={o} className="flex items-center gap-1.5 text-sm font-normal text-ink">
                                  <input
                                    type="checkbox"
                                    name={name}
                                    value={o}
                                    defaultChecked={Array.isArray(value) && (value as string[]).includes(o)}
                                  />
                                  {o}
                                </label>
                              ))}
                            </span>
                          )}
                          {def.type === "DATE" && (
                            <Input name={name} type="date" defaultValue={typeof value === "string" ? value : ""} className="mt-1 block w-full" />
                          )}
                          {def.type === "NUMBER" && (
                            <Input name={name} type="number" step="any" defaultValue={typeof value === "number" ? String(value) : ""} className="mt-1 block w-full" />
                          )}
                          {def.type === "TEXT" && (
                            <Input name={name} type="text" defaultValue={typeof value === "string" ? value : ""} className="mt-1 block w-full" />
                          )}
                        </label>
                      );
                    })}
                    <div className="sm:col-span-2">
                      <SubmitButton pendingLabel="Saving...">Save details</SubmitButton>
                    </div>
                  </form>
                ) : (
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    {fieldDefinitions.map((def) => (
                      <ReadField key={def.id} label={def.label} value={formatFieldValue(def.type, valueByFieldId[def.id] ?? null)} />
                    ))}
                  </dl>
                )}
              </Card>
            )}
          </div>

          <div className="flex flex-col gap-5">
            {/* Household management */}
            {canManage && (
              <Card padding="md">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                  <Home size={15} /> Household
                </h2>
                <form action={boundSetHousehold} className="space-y-2">
                  <label className="block text-xs text-ink-secondary">
                    Assign to household
                    <Select name="householdId" defaultValue={person.householdId ?? ""} className="mt-1 text-sm">
                      <option value="">— None —</option>
                      {households.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <Input name="newHouseholdName" placeholder="…or new household name" className="text-sm" />
                  <Select name="householdRole" defaultValue={person.householdRole ?? "ADULT"} className="text-sm">
                    {HOUSEHOLD_ROLE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                  <button type="submit" className={buttonClasses("secondary", "sm") + " w-full"}>
                    Update household
                  </button>
                </form>
              </Card>
            )}

            {/* Relationships */}
            <Card padding="md">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                <Link2 size={15} /> Relationships
              </h2>
              {person.relationshipsFrom.length === 0 ? (
                <p className="mb-3 text-sm text-ink-muted">No relationships yet.</p>
              ) : (
                <ul className="mb-3 space-y-2">
                  {person.relationshipsFrom.map((rel) => (
                    <li key={rel.id} className="flex items-center justify-between gap-2 text-sm">
                      <span>
                        <Link href={`/people/${rel.relatedPersonId}`} className="text-ink hover:text-accent">
                          {personDisplayName(rel.relatedPerson)}
                        </Link>
                        <span className="ml-2 text-xs text-ink-muted">{relationshipTypeLabel(rel.type)}</span>
                      </span>
                      {canManage && (
                        <form action={removeRelationshipAction.bind(null, person.id, rel.relatedPersonId, rel.type)}>
                          <button
                            type="submit"
                            aria-label={`Remove ${personDisplayName(rel.relatedPerson)}`}
                            className="rounded-sm p-1 text-ink-muted hover:bg-surface-muted hover:text-danger"
                          >
                            <X size={14} />
                          </button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {canManage && otherPeople.length > 0 && (
                <form action={boundAddRelationship} className="space-y-2 border-t border-border pt-3">
                  <Select name="relatedPersonId" defaultValue="" required className="text-sm">
                    <option value="" disabled>
                      Choose a person…
                    </option>
                    {otherPeople.map((p) => (
                      <option key={p.id} value={p.id}>
                        {personDisplayName(p)}
                      </option>
                    ))}
                  </Select>
                  <Select name="type" defaultValue="OTHER" className="text-sm">
                    {RELATIONSHIP_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                  <button type="submit" className={buttonClasses("secondary", "sm") + " w-full"}>
                    Add relationship
                  </button>
                </form>
              )}
            </Card>

            {/* Communications consent (BLUEPRINT §19). */}
            {canViewMessages && canManage && (
              <Card padding="md">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                  <Mail size={15} /> Email consent
                </h2>
                {person.emailOptedOutAt && (
                  <p className="mb-3 flex items-center gap-1.5 rounded-md bg-warning-bg px-3 py-2 text-xs text-warning">
                    <MailX size={13} /> Opted out since {new Date(person.emailOptedOutAt).toLocaleDateString()}
                  </p>
                )}
                <form action={setEmailOptOutAction.bind(null, person.id, !person.emailOptedOutAt)}>
                  <button type="submit" className={buttonClasses("secondary", "sm") + " w-full"}>
                    {person.emailOptedOutAt ? (
                      <>
                        <Mail size={14} /> Clear email opt-out
                      </>
                    ) : (
                      <>
                        <MailX size={14} /> Opt out of email
                      </>
                    )}
                  </button>
                </form>
              </Card>
            )}

            {/* Archive / restore */}
            {canManage && (
              <Card padding="md">
                <h2 className="mb-2 text-sm font-semibold text-ink">Record</h2>
                {person.archivedAt ? (
                  <>
                    <p className="mb-3 text-xs text-ink-muted">
                      Archived {new Date(person.archivedAt).toLocaleDateString()}. History is preserved.
                    </p>
                    <form action={boundRestore}>
                      <button type="submit" className={buttonClasses("secondary", "sm") + " w-full"}>
                        <Undo2 size={14} /> Restore person
                      </button>
                    </form>
                  </>
                ) : (
                  <>
                    <p className="mb-3 text-xs text-ink-muted">Archiving hides this person from lists without deleting their record.</p>
                    <form action={boundArchive}>
                      <button type="submit" className={buttonClasses("danger", "sm") + " w-full"}>
                        <Trash2 size={14} /> Archive person
                      </button>
                    </form>
                  </>
                )}
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------- Serving ------------------------------- */}
      {tab === "serving" && canViewServing && (
        <Card padding="md" className="max-w-2xl">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <HeartHandshake size={15} /> Serving
          </h2>
          {personServing.filter((a) => a.status === "ACTIVE").length === 0 ? (
            <p className="mb-3 text-sm text-ink-muted">Not serving anywhere.</p>
          ) : (
            <ul className="mb-3 space-y-1.5 text-sm">
              {personServing
                .filter((a) => a.status === "ACTIVE")
                .map((a) => (
                  <li key={a.id}>
                    <Link href={`/serving/${a.position.team.id}`} className="text-ink hover:text-accent">
                      {a.position.name}
                    </Link>
                    <span className="text-xs text-ink-muted"> · {a.position.team.name}</span>
                  </li>
                ))}
            </ul>
          )}

          <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Qualifications</h3>
          {personQualifications.length === 0 ? (
            <p className="mb-2 text-sm text-ink-muted">None recorded.</p>
          ) : (
            <ul className="mb-2 space-y-1.5 text-sm">
              {personQualifications.map((q) => {
                const expired = q.expiresAt && q.expiresAt.getTime() <= Date.now();
                return (
                  <li key={q.id} className="flex items-center justify-between gap-2">
                    <span className={expired ? "text-warning" : "text-ink"}>
                      {q.name}
                      {q.expiresAt && (
                        <span className="ml-1 text-xs text-ink-muted">
                          {expired ? "expired" : "until"} {new Date(q.expiresAt).toLocaleDateString()}
                        </span>
                      )}
                    </span>
                    {canManageServing && (
                      <form action={revokeQualificationAction.bind(null, person.id, q.name)}>
                        <button
                          type="submit"
                          aria-label={`Revoke ${q.name}`}
                          className="rounded-sm p-1 text-ink-muted hover:bg-surface-muted hover:text-danger"
                        >
                          <X size={13} />
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {canManageServing && (
            <form action={grantQualificationAction.bind(null, person.id)} className="space-y-2 border-t border-border pt-3">
              <Input name="name" required placeholder="Qualification, e.g. child-safety-training" className="text-sm" />
              <div className="flex gap-2">
                <Input name="expiresAt" type="date" className="text-sm" />
                <button type="submit" className={buttonClasses("secondary", "sm") + " shrink-0"}>
                  Grant
                </button>
              </div>
            </form>
          )}
        </Card>
      )}

      {/* ------------------------------- Files ------------------------------- */}
      {tab === "files" && canViewFiles && (
        <Card padding="md" className="max-w-2xl">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <Paperclip size={15} /> Files
          </h2>
          {personFiles.length === 0 ? (
            <p className="mb-3 text-sm text-ink-muted">No files attached.</p>
          ) : (
            <ul className="mb-3 space-y-2">
              {personFiles.map((file) => (
                <li key={file.id} className="flex items-center justify-between gap-2 text-sm">
                  <a href={`/api/files/${file.id}`} className="flex min-w-0 items-center gap-1.5 text-ink hover:text-accent">
                    <FileText size={14} className="shrink-0 text-ink-muted" />
                    <span className="truncate">{file.fileName}</span>
                  </a>
                  {canManageFiles && (
                    <form action={archivePersonFileAction.bind(null, person.id, file.id)}>
                      <button
                        type="submit"
                        aria-label={`Archive ${file.fileName}`}
                        className="rounded-sm p-1 text-ink-muted hover:bg-surface-muted hover:text-danger"
                      >
                        <X size={13} />
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canManageFiles && (
            <form action={uploadPersonFileAction.bind(null, person.id)} className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <input
                type="file"
                name="file"
                required
                className="max-w-52 text-xs text-ink-secondary file:mr-2 file:rounded-sm file:border file:border-border-strong file:bg-surface file:px-2.5 file:py-1.5 file:text-xs file:text-ink"
              />
              <button type="submit" className={buttonClasses("secondary", "sm")}>
                Upload
              </button>
              <span className="w-full text-xs text-ink-muted">Private — every download is authorized and audited. 10 MB max.</span>
            </form>
          )}
        </Card>
      )}
    </div>
  );
}

/** The unified activity list: quiet date rail on the left, one line per event. */
function Timeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <ol className="space-y-0" data-section="person-timeline">
      {entries.map((entry, i) => (
        <li key={i} className="relative flex gap-4 pb-4 last:pb-0">
          <div className="flex w-16 shrink-0 flex-col items-end pt-0.5">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              {entry.at.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          </div>
          <div className="relative flex flex-col items-center">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent/60" />
            {i < entries.length - 1 && <span className="w-px flex-1 bg-border" />}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            {entry.href ? (
              <Link href={entry.href} className="text-[15px] text-ink hover:text-accent">
                {entry.label}
              </Link>
            ) : (
              <p className="text-[15px] text-ink">{entry.label}</p>
            )}
            {entry.detail && <p className="truncate text-sm text-ink-muted">{entry.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function ReadField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-ink">{value || "—"}</dd>
    </div>
  );
}
