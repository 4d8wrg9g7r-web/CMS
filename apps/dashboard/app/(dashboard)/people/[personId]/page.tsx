import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckSquare, FileText, HeartHandshake, Home, Link2, Mail, MailX, Map, Paperclip, Trash2, Undo2, Users2, X, Zap } from "lucide-react";
import { checkinService, fileService, formatFieldValue, groupService, isOverdue, journeyService, messageService, peopleService, personDisplayName, taskService, volunteerService } from "@cms/database";
import { campusService } from "@cms/database";
import { SubmitButton } from "../../../../components/SubmitButton";
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

export default async function PersonDetailPage({ params }: { params: Promise<{ personId: string }> }) {
  const organization = await getCurrentOrganization();
  if (!organization) return null;
  await requirePeople(organization.id, "person.view");
  const canManage = await canPeople(organization.id, "person.manage");

  const { personId } = await params;
  const person = await peopleService.getPerson(organization.id, personId);
  if (!person) notFound();

  const [campuses, households, allPeople] = await Promise.all([
    campusService.listCampuses(organization.id),
    peopleService.listHouseholds(organization.id),
    // v1: a bounded select rather than autocomplete. 200 is well past any small church's
    // roster; larger orgs get search-based relationship linking in a later iteration.
    peopleService.listPeople(organization.id, { take: 200 }),
  ]);
  const otherPeople = allPeople.filter((p) => p.id !== person.id);

  // Groups this person belongs to -- only surfaced if the viewer can also view Groups.
  // A read-only panel; management lives on the group's own page.
  const canViewGroups = await canGroups(organization.id, "group.view");
  const groupMemberships = canViewGroups
    ? await groupService.listGroupsForPerson(organization.id, person.id)
    : [];

  // Open follow-up tasks about this person -- same read-only-panel pattern as Groups.
  const canViewTasks = await canTasks(organization.id, "task.view");
  const personTasks = canViewTasks ? await taskService.listTasksForPerson(organization.id, person.id) : [];

  // Journey enrollments with progress -- same read-only-panel pattern.
  const canViewJourneys = await canJourneys(organization.id, "journey.view");
  const personJourneys = canViewJourneys
    ? await journeyService.listEnrollmentsForPerson(organization.id, person.id)
    : [];

  // Recent messages to this person -- same read-only-panel pattern.
  const canViewMessages = await canMessages(organization.id, "message.view");
  const personMessages = canViewMessages
    ? await messageService.listMessagesForPerson(organization.id, person.id, 5)
    : [];

  // Recent attendance -- same read-only-panel pattern.
  const canViewCheckins = await canCheckin(organization.id, "checkin.view");
  const personCheckIns = canViewCheckins
    ? await checkinService.listCheckInsForPerson(organization.id, person.id, 5)
    : [];

  // Private attachments (BLUEPRINT §41).
  const canViewFiles = await canFiles(organization.id, "file.view");
  const canManageFiles = await canFiles(organization.id, "file.manage");
  const personFiles = canViewFiles ? await fileService.listFilesForPerson(organization.id, person.id) : [];

  // Serving + qualifications (BLUEPRINT §10).
  const canViewServing = await canVolunteers(organization.id, "volunteer.view");
  const canManageServing = await canVolunteers(organization.id, "volunteer.manage");
  const [personServing, personQualifications] = canViewServing
    ? await Promise.all([
        volunteerService.listServingForPerson(organization.id, person.id),
        volunteerService.listQualificationsForPerson(organization.id, person.id),
      ])
    : [[], []];

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
  const valueByFieldId: Record<string, unknown> = Object.fromEntries(
    person.fieldValues.map((v) => [v.fieldId, v.value]),
  );

  return (
    <div>
      <Link href="/people" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
        <ArrowLeft size={15} /> Back to People
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{personDisplayName(person)}</h1>
        <Badge variant={membershipStatusTone(person.membershipStatus)}>
          {membershipStatusLabel(person.membershipStatus)}
        </Badge>
        {person.archivedAt && <Badge variant="warning">Archived</Badge>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
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
              <dl className="grid gap-3 sm:grid-cols-2 text-sm">
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
            <Card padding="md" className="mt-6">
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
                <dl className="grid gap-3 sm:grid-cols-2 text-sm">
                  {fieldDefinitions.map((def) => (
                    <ReadField key={def.id} label={def.label} value={formatFieldValue(def.type, valueByFieldId[def.id] ?? null)} />
                  ))}
                </dl>
              )}
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          {/* Household */}
          <Card padding="md">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
              <Home size={15} /> Household
            </h2>
            {person.household ? (
              <div className="mb-4">
                <p className="text-sm font-medium text-ink">{person.household.name}</p>
                <p className="text-xs text-ink-muted">
                  {householdRoleLabel(person.householdRole)} · {person.household.members.length}{" "}
                  {person.household.members.length === 1 ? "member" : "members"}
                </p>
                <ul className="mt-2 space-y-1 text-sm text-ink-secondary">
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
              <p className="mb-4 text-sm text-ink-muted">Not in a household.</p>
            )}

            {canManage && (
              <form action={boundSetHousehold} className="space-y-2 border-t border-border pt-3">
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

          {/* Journeys -- read-only progress; management lives on the journey page. */}
          {canViewJourneys && personJourneys.length > 0 && (
            <Card padding="md">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                <Map size={15} /> Journeys
              </h2>
              <ul className="space-y-3">
                {personJourneys.map((enrollment) => (
                  <li key={enrollment.id} className="text-sm">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <Link href={`/journeys/${enrollment.journeyId}`} className="text-ink hover:text-accent">
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

          {/* Follow-up tasks -- read-only; management lives on /tasks. */}
          {canViewTasks && (
            <Card padding="md">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                <CheckSquare size={15} /> Follow-ups
              </h2>
              {personTasks.length === 0 ? (
                <p className="mb-2 text-sm text-ink-muted">No open tasks for this person.</p>
              ) : (
                <ul className="mb-2 space-y-2">
                  {personTasks.map((task) => (
                    <li key={task.id} className="text-sm">
                      <span className="text-ink">{task.title}</span>
                      {task.workflowRunId && <Zap size={11} className="ml-1.5 inline text-accent-dark" />}
                      <span className="block text-xs text-ink-muted">
                        {task.dueAt && (
                          <span className={isOverdue(task) ? "font-medium text-danger" : undefined}>
                            Due {new Date(task.dueAt).toLocaleDateString()}
                          </span>
                        )}
                        {task.dueAt && task.assignee && " · "}
                        {task.assignee && (task.assignee.name || task.assignee.email)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Link href={`/tasks?person=${person.id}`} className="text-xs text-accent hover:underline">
                View in Tasks →
              </Link>
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

          {/* Private files (BLUEPRINT §41) -- downloads authorize per request. */}
          {canViewFiles && (
            <Card padding="md">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                <Paperclip size={15} /> Files
              </h2>
              {personFiles.length === 0 ? (
                <p className="mb-3 text-sm text-ink-muted">No files attached.</p>
              ) : (
                <ul className="mb-3 space-y-2">
                  {personFiles.map((file) => (
                    <li key={file.id} className="flex items-center justify-between gap-2 text-sm">
                      <a
                        href={`/api/files/${file.id}`}
                        className="flex min-w-0 items-center gap-1.5 text-ink hover:text-accent"
                      >
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

          {/* Serving & qualifications (BLUEPRINT §10). */}
          {canViewServing && (
            <Card padding="md">
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

              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Qualifications</h3>
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
                            <button type="submit" aria-label={`Revoke ${q.name}`} className="rounded-sm p-1 text-ink-muted hover:bg-surface-muted hover:text-danger">
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

          {/* Attendance -- recent check-ins, read-only. */}
          {canViewCheckins && personCheckIns.length > 0 && (
            <Card padding="md">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                <CheckSquare size={15} /> Attendance
              </h2>
              <ul className="space-y-2">
                {personCheckIns.map((checkIn) => (
                  <li key={checkIn.id} className="text-sm">
                    <Link href={`/events/${checkIn.eventId}`} className="text-ink hover:text-accent">
                      {checkIn.event.title}
                    </Link>
                    <span className="block text-xs text-ink-muted">
                      {new Date(checkIn.occurrenceAt).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Communications -- recent messages + consent (BLUEPRINT §19). */}
          {canViewMessages && (
            <Card padding="md">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                <Mail size={15} /> Communications
              </h2>
              {person.emailOptedOutAt && (
                <p className="mb-3 flex items-center gap-1.5 rounded-md bg-warning-bg px-3 py-2 text-xs text-warning">
                  <MailX size={13} /> Opted out of email since {new Date(person.emailOptedOutAt).toLocaleDateString()}
                </p>
              )}
              {personMessages.length === 0 ? (
                <p className="mb-3 text-sm text-ink-muted">No messages sent yet.</p>
              ) : (
                <ul className="mb-3 space-y-2">
                  {personMessages.map((message) => (
                    <li key={message.id} className="text-sm">
                      <span className="text-ink">{message.subject}</span>
                      <span className="block text-xs text-ink-muted">
                        {message.status.toLowerCase()} · {new Date(message.sentAt ?? message.createdAt).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {canManage && (
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
              )}
            </Card>
          )}

          {/* Archive / restore */}
          {canManage && (
            <Card padding="md">
              <h2 className="mb-2 text-sm font-semibold text-ink">Status</h2>
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
                  <p className="mb-3 text-xs text-ink-muted">
                    Archiving hides this person from lists without deleting their record.
                  </p>
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
    </div>
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
