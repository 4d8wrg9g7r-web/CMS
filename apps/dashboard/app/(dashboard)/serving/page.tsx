import Link from "next/link";
import { HeartHandshake, Lock, Plus } from "lucide-react";
import { volunteerService } from "@cms/database";
import { buttonClasses } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Input, Textarea } from "../../../components/ui/Input";
import { canVolunteers } from "../../../lib/volunteers-access";
import { getCurrentOrganization } from "../../../lib/session";
import { createTeamAction } from "./actions";

export default async function ServingPage() {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  const [canView, canManage] = await Promise.all([
    canVolunteers(organization.id, "volunteer.view"),
    canVolunteers(organization.id, "volunteer.manage"),
  ]);

  if (!canView) {
    return (
      <div>
        <h1 className="mb-1 text-display text-[28px] leading-tight text-ink">Serving</h1>
        <Card padding="md" className="mt-6">
          <EmptyState
            icon={<Lock size={22} />}
            title="You don't have access to Serving"
            description="Serving teams and qualifications are restricted to organization owners and admins."
          />
        </Card>
      </div>
    );
  }

  const teams = await volunteerService.listTeams(organization.id);

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-1 text-display text-[28px] leading-tight text-ink">Serving</h1>
        <p className="text-sm text-ink-secondary">
          Teams, positions, and who serves where — with qualification flags, never silent blocks.
        </p>
      </div>

      {canManage && (
        <Card padding="md" className="mb-6">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <Plus size={15} /> New team
          </h2>
          <form action={createTeamAction} className="flex flex-wrap items-end gap-3">
            <label className="text-sm text-ink-secondary">
              Name
              <Input name="name" required placeholder="Kids Ministry" className="mt-1 w-64" />
            </label>
            <label className="text-sm text-ink-secondary">
              Description
              <Textarea name="description" rows={1} className="mt-1 w-80" />
            </label>
            <button type="submit" className={buttonClasses("primary", "md")}>
              Create team
            </button>
          </form>
        </Card>
      )}

      {teams.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<HeartHandshake size={22} />}
            title="No serving teams yet"
            description="Create a team, add positions with their required qualifications, then assign people."
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {teams.map((team) => {
            const activeCount = team.positions.reduce((sum, p) => sum + p._count.assignments, 0);
            return (
              <Link key={team.id} href={`/serving/${team.id}`}>
                <Card padding="md" interactive>
                  <h2 className="mb-1 text-sm font-semibold text-ink">{team.name}</h2>
                  {team.description && <p className="mb-2 text-sm text-ink-secondary">{team.description}</p>}
                  <p className="text-xs text-ink-muted">
                    {team.positions.length} position{team.positions.length === 1 ? "" : "s"} · {activeCount} serving
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
