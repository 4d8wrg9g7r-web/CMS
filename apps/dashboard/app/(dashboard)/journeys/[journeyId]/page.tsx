import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowUp, Check, Plus, Trash2, Undo2, UserPlus, X, Zap } from "lucide-react";
import { journeyProgress, journeyService, peopleService, personDisplayName } from "@cms/database";
import { Badge } from "../../../../components/ui/Badge";
import { buttonClasses } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { Input, Select, Textarea } from "../../../../components/ui/Input";
import { canJourneys, requireJourneys } from "../../../../lib/journeys-access";
import { getCurrentOrganization } from "../../../../lib/session";
import {
  addMilestoneAction,
  archiveJourneyAction,
  completeMilestoneAction,
  enrollPersonAction,
  exitEnrollmentAction,
  moveMilestoneAction,
  reactivateEnrollmentAction,
  removeMilestoneAction,
  restoreJourneyAction,
  uncompleteMilestoneAction,
  updateJourneyAction,
} from "../actions";

export default async function JourneyDetailPage({ params }: { params: Promise<{ journeyId: string }> }) {
  const organization = await getCurrentOrganization();
  if (!organization) return null;
  await requireJourneys(organization.id, "journey.view");
  const canManage = await canJourneys(organization.id, "journey.manage");

  const { journeyId } = await params;
  const journey = await journeyService.getJourney(organization.id, journeyId);
  if (!journey) notFound();

  const allPeople = await peopleService.listPeople(organization.id, { take: 200 });
  const enrolledIds = new Set(journey.enrollments.map((e) => e.personId));
  const enrollable = allPeople.filter((p) => !enrolledIds.has(p.id));

  return (
    <div>
      <Link href="/journeys" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
        <ArrowLeft size={15} /> Back to Journeys
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-display text-[28px] leading-tight text-ink">{journey.name}</h1>
        {journey.isActive ? <Badge variant="success">Open</Badge> : <Badge variant="warning">Closed</Badge>}
        {journey.archivedAt && <Badge variant="warning">Archived</Badge>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Enrollments */}
          <Card padding="md">
            <h2 className="mb-4 text-sm font-semibold text-ink">People on this pathway ({journey.enrollments.length})</h2>
            {journey.enrollments.length === 0 ? (
              <p className="text-sm text-ink-muted">No one enrolled yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {journey.enrollments.map((enrollment) => {
                  const progress = journeyProgress(
                    journey.milestones,
                    enrollment.completions.map((c) => c.milestoneId),
                  );
                  const completedIds = new Set(enrollment.completions.map((c) => c.milestoneId));
                  return (
                    <li key={enrollment.id} className="py-3">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <Link
                          href={`/people/${enrollment.personId}`}
                          className="text-sm font-medium text-ink hover:text-accent"
                        >
                          {personDisplayName(enrollment.person)}
                        </Link>
                        {enrollment.workflowRunId && (
                          <span className="inline-flex items-center gap-1 text-xs text-accent-dark">
                            <Zap size={11} /> automated
                          </span>
                        )}
                        <Badge
                          variant={
                            enrollment.status === "COMPLETED"
                              ? "success"
                              : enrollment.status === "EXITED"
                                ? "warning"
                                : "info"
                          }
                        >
                          {enrollment.status === "ACTIVE"
                            ? progress.nextMilestone
                              ? `Next: ${progress.nextMilestone.name}`
                              : "Active"
                            : enrollment.status === "COMPLETED"
                              ? "Completed"
                              : "Exited"}
                        </Badge>
                        <span className="ml-auto text-xs text-ink-muted">
                          {progress.completedMilestones}/{progress.totalMilestones}
                        </span>
                      </div>
                      <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${progress.percent}%` }} />
                      </div>
                      {canManage && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {journey.milestones.map((m) => {
                            const done = completedIds.has(m.id);
                            const action = done
                              ? uncompleteMilestoneAction.bind(null, journey.id, enrollment.id, m.id, enrollment.personId)
                              : completeMilestoneAction.bind(null, journey.id, enrollment.id, m.id, enrollment.personId);
                            return (
                              <form key={m.id} action={action}>
                                <button
                                  type="submit"
                                  disabled={enrollment.status === "EXITED"}
                                  title={done ? `Undo "${m.name}"` : `Complete "${m.name}"`}
                                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                                    done
                                      ? "border-success/40 bg-success-bg text-success"
                                      : "border-border text-ink-secondary hover:bg-surface-muted"
                                  } disabled:opacity-50`}
                                >
                                  {done && <Check size={11} />} {m.name}
                                </button>
                              </form>
                            );
                          })}
                          {enrollment.status === "ACTIVE" ? (
                            <form action={exitEnrollmentAction.bind(null, journey.id, enrollment.id, enrollment.personId)} className="ml-auto">
                              <button type="submit" className="rounded-sm p-1 text-ink-muted hover:text-danger" title="Exit journey">
                                <X size={14} />
                              </button>
                            </form>
                          ) : enrollment.status === "EXITED" ? (
                            <form action={reactivateEnrollmentAction.bind(null, journey.id, enrollment.id, enrollment.personId)} className="ml-auto">
                              <button type="submit" className={buttonClasses("ghost", "sm")}>
                                <Undo2 size={13} /> Reactivate
                              </button>
                            </form>
                          ) : null}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {canManage && enrollable.length > 0 && journey.isActive && (
              <form action={enrollPersonAction.bind(null, journey.id)} className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
                <label className="text-xs text-ink-secondary">
                  Enroll someone
                  <Select name="personId" defaultValue="" required className="mt-1 w-56 text-sm">
                    <option value="" disabled>
                      Choose a person…
                    </option>
                    {enrollable.map((p) => (
                      <option key={p.id} value={p.id}>
                        {personDisplayName(p)}
                      </option>
                    ))}
                  </Select>
                </label>
                <button type="submit" className={buttonClasses("secondary", "sm")}>
                  <UserPlus size={14} /> Enroll
                </button>
              </form>
            )}
          </Card>

          {/* Settings */}
          {canManage && (
            <Card padding="md">
              <h2 className="mb-4 text-sm font-semibold text-ink">Settings</h2>
              <form action={updateJourneyAction.bind(null, journey.id)} className="space-y-4">
                <label className="block text-sm text-ink-secondary">
                  Name
                  <Input name="name" defaultValue={journey.name} required className="mt-1" />
                </label>
                <label className="block text-sm text-ink-secondary">
                  Description
                  <Textarea name="description" rows={2} defaultValue={journey.description ?? ""} className="mt-1" />
                </label>
                <label className="flex items-center gap-2 text-sm text-ink-secondary">
                  <input
                    type="checkbox"
                    name="isActive"
                    defaultChecked={journey.isActive}
                    className="h-4 w-4 rounded border-border-strong text-accent"
                  />
                  Open to new enrollment
                </label>
                <button type="submit" className={buttonClasses("primary", "md")}>
                  Save settings
                </button>
              </form>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          {/* Milestones */}
          <Card padding="md">
            <h2 className="mb-3 text-sm font-semibold text-ink">Milestones</h2>
            {journey.milestones.length === 0 ? (
              <p className="mb-3 text-sm text-ink-muted">No milestones yet — add the first step below.</p>
            ) : (
              <ol className="mb-3 space-y-2">
                {journey.milestones.map((m, i) => (
                  <li key={m.id} className="flex items-center gap-2 text-sm">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-ink-secondary">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-ink" title={m.description ?? undefined}>
                      {m.name}
                      {m.targetDays && <span className="ml-1 text-xs text-ink-muted">~{m.targetDays}d</span>}
                    </span>
                    {canManage && (
                      <span className="flex items-center">
                        <form action={moveMilestoneAction.bind(null, journey.id, m.id, "up")}>
                          <button type="submit" aria-label="Move up" className="rounded-sm p-0.5 text-ink-muted hover:text-ink">
                            <ArrowUp size={13} />
                          </button>
                        </form>
                        <form action={moveMilestoneAction.bind(null, journey.id, m.id, "down")}>
                          <button type="submit" aria-label="Move down" className="rounded-sm p-0.5 text-ink-muted hover:text-ink">
                            <ArrowDown size={13} />
                          </button>
                        </form>
                        <form action={removeMilestoneAction.bind(null, journey.id, m.id)}>
                          <button type="submit" aria-label="Remove milestone" className="rounded-sm p-0.5 text-ink-muted hover:text-danger">
                            <Trash2 size={13} />
                          </button>
                        </form>
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {canManage && (
              <form action={addMilestoneAction.bind(null, journey.id)} className="space-y-2 border-t border-border pt-3">
                <Input name="name" required placeholder="Milestone name" className="text-sm" />
                <div className="flex gap-2">
                  <Input name="targetDays" type="number" min={1} placeholder="Target days" className="w-32 text-sm" />
                  <button type="submit" className={buttonClasses("secondary", "sm") + " flex-1"}>
                    <Plus size={14} /> Add milestone
                  </button>
                </div>
                <p className="text-xs text-ink-muted">
                  Editing milestones affects everyone&rsquo;s progress — journeys are living pathways.
                </p>
              </form>
            )}
          </Card>

          {canManage && (
            <Card padding="md">
              <h2 className="mb-2 text-sm font-semibold text-ink">Status</h2>
              {journey.archivedAt ? (
                <form action={restoreJourneyAction.bind(null, journey.id)}>
                  <button type="submit" className={buttonClasses("secondary", "sm") + " w-full"}>
                    <Undo2 size={14} /> Restore journey
                  </button>
                </form>
              ) : (
                <form action={archiveJourneyAction.bind(null, journey.id)}>
                  <button type="submit" className={buttonClasses("danger", "sm") + " w-full"}>
                    <Trash2 size={14} /> Archive pathway
                  </button>
                </form>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
