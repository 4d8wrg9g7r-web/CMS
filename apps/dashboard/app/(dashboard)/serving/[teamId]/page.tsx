import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Plus, Trash2, Undo2, UserPlus, X } from "lucide-react";
import { isEligible, peopleService, personDisplayName, volunteerService } from "@cms/database";
import { Badge } from "../../../../components/ui/Badge";
import { buttonClasses } from "../../../../components/ui/Button";
import { Card } from "../../../../components/ui/Card";
import { Input, Select, Textarea } from "../../../../components/ui/Input";
import { canVolunteers, requireVolunteers } from "../../../../lib/volunteers-access";
import { getCurrentOrganization } from "../../../../lib/session";
import {
  addPositionAction,
  archiveTeamAction,
  assignAction,
  deactivateAssignmentAction,
  removePositionAction,
  restoreTeamAction,
  updateTeamAction,
} from "../actions";

export default async function ServingTeamPage({ params }: { params: Promise<{ teamId: string }> }) {
  const organization = await getCurrentOrganization();
  if (!organization) return null;
  await requireVolunteers(organization.id, "volunteer.view");
  const canManage = await canVolunteers(organization.id, "volunteer.manage");

  const { teamId } = await params;
  const team = await volunteerService.getTeam(organization.id, teamId);
  if (!team) notFound();

  const allPeople = await peopleService.listPeople(organization.id, { take: 200 });
  const now = new Date();

  return (
    <div>
      <Link href="/serving" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
        <ArrowLeft size={15} /> Back to Serving
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{team.name}</h1>
        {team.archivedAt && <Badge variant="warning">Archived</Badge>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 flex flex-col gap-6">
          {team.positions.length === 0 && (
            <Card padding="md">
              <p className="text-sm text-ink-muted">No positions yet — add one on the right.</p>
            </Card>
          )}
          {team.positions.map((position) => {
            const activeAssignments = position.assignments.filter((a) => a.status === "ACTIVE");
            const assignedIds = new Set(position.assignments.map((a) => a.personId));
            const assignable = allPeople.filter((p) => !assignedIds.has(p.id) || position.assignments.some((a) => a.personId === p.id && a.status === "INACTIVE"));
            return (
              <Card key={position.id} padding="md">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-ink">{position.name}</h2>
                  {canManage && (
                    <form action={removePositionAction.bind(null, team.id, position.id)}>
                      <button type="submit" aria-label="Remove position" className="rounded-sm p-1 text-ink-muted hover:bg-surface-muted hover:text-danger">
                        <Trash2 size={14} />
                      </button>
                    </form>
                  )}
                </div>
                {position.requiredQualifications.length > 0 && (
                  <p className="mb-3 text-xs text-ink-muted">
                    Requires: {position.requiredQualifications.join(", ")}
                  </p>
                )}

                {activeAssignments.length === 0 ? (
                  <p className="mb-3 text-sm text-ink-muted">No one assigned.</p>
                ) : (
                  <ul className="mb-3 divide-y divide-border">
                    {activeAssignments.map((assignment) => {
                      const eligibility = isEligible(position.requiredQualifications, assignment.person.qualifications, now);
                      return (
                        <li key={assignment.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={`/people/${assignment.personId}`} className="font-medium text-ink hover:text-accent">
                              {personDisplayName(assignment.person)}
                            </Link>
                            {eligibility.eligible ? (
                              <Badge variant="success">Qualified</Badge>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2.5 py-1 text-xs font-medium text-warning"
                                title={[
                                  eligibility.missing.length ? `Missing: ${eligibility.missing.join(", ")}` : "",
                                  eligibility.expired.length ? `Expired: ${eligibility.expired.join(", ")}` : "",
                                ].filter(Boolean).join(" · ")}
                              >
                                <AlertTriangle size={11} />
                                {eligibility.missing.length > 0 && `${eligibility.missing.length} missing`}
                                {eligibility.missing.length > 0 && eligibility.expired.length > 0 && ", "}
                                {eligibility.expired.length > 0 && `${eligibility.expired.length} expired`}
                              </span>
                            )}
                          </div>
                          {canManage && (
                            <form action={deactivateAssignmentAction.bind(null, team.id, assignment.id, assignment.personId)}>
                              <button type="submit" aria-label="End assignment" title="End assignment (history kept)" className="rounded-sm p-1 text-ink-muted hover:bg-surface-muted hover:text-danger">
                                <X size={14} />
                              </button>
                            </form>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {canManage && assignable.length > 0 && (
                  <form action={assignAction.bind(null, team.id, position.id)} className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
                    <Select name="personId" defaultValue="" required className="w-56 text-sm">
                      <option value="" disabled>
                        Choose a person…
                      </option>
                      {assignable.map((p) => (
                        <option key={p.id} value={p.id}>
                          {personDisplayName(p)}
                        </option>
                      ))}
                    </Select>
                    <button type="submit" className={buttonClasses("secondary", "sm")}>
                      <UserPlus size={14} /> Assign
                    </button>
                  </form>
                )}
              </Card>
            );
          })}
        </div>

        <div className="flex flex-col gap-6">
          {canManage && (
            <Card padding="md">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                <Plus size={15} /> Add position
              </h2>
              <form action={addPositionAction.bind(null, team.id)} className="space-y-2">
                <Input name="name" required placeholder="Position name" className="text-sm" />
                <Input
                  name="requiredQualifications"
                  placeholder="Required qualifications (comma-separated)"
                  className="text-sm"
                />
                <button type="submit" className={buttonClasses("secondary", "sm") + " w-full"}>
                  Add position
                </button>
              </form>
            </Card>
          )}

          {canManage && (
            <Card padding="md">
              <h2 className="mb-3 text-sm font-semibold text-ink">Team settings</h2>
              <form action={updateTeamAction.bind(null, team.id)} className="space-y-3">
                <Input name="name" defaultValue={team.name} required className="text-sm" />
                <Textarea name="description" rows={2} defaultValue={team.description ?? ""} className="text-sm" />
                <button type="submit" className={buttonClasses("primary", "sm") + " w-full"}>
                  Save
                </button>
              </form>
            </Card>
          )}

          {canManage && (
            <Card padding="md">
              <h2 className="mb-2 text-sm font-semibold text-ink">Status</h2>
              {team.archivedAt ? (
                <form action={restoreTeamAction.bind(null, team.id)}>
                  <button type="submit" className={buttonClasses("secondary", "sm") + " w-full"}>
                    <Undo2 size={14} /> Restore team
                  </button>
                </form>
              ) : (
                <form action={archiveTeamAction.bind(null, team.id)}>
                  <button type="submit" className={buttonClasses("danger", "sm") + " w-full"}>
                    <Trash2 size={14} /> Archive team
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
