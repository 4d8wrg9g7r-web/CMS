import Link from "next/link";
import { Lock, Map, Plus } from "lucide-react";
import { journeyService } from "@cms/database";
import { Badge } from "../../../components/ui/Badge";
import { buttonClasses } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { canJourneys } from "../../../lib/journeys-access";
import { getCurrentOrganization } from "../../../lib/session";

export default async function JourneysPage() {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  const [canView, canManage] = await Promise.all([
    canJourneys(organization.id, "journey.view"),
    canJourneys(organization.id, "journey.manage"),
  ]);

  if (!canView) {
    return (
      <div>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-ink">Journeys</h1>
        <Card padding="md" className="mt-6">
          <EmptyState
            icon={<Lock size={22} />}
            title="You don't have access to Journeys"
            description="Journeys and enrollment are restricted to organization owners and admins."
          />
        </Card>
      </div>
    );
  }

  const journeys = await journeyService.listJourneys(organization.id);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-2xl font-semibold tracking-tight text-ink">Journeys</h1>
          <p className="text-sm text-ink-secondary">
            Your church&rsquo;s next-step pathways — define the milestones, track everyone&rsquo;s progress.
          </p>
        </div>
        {canManage && (
          <Link href="/journeys/new" className={buttonClasses("primary", "md")}>
            <Plus size={16} /> New journey
          </Link>
        )}
      </div>

      {journeys.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<Map size={22} />}
            title="No journeys yet"
            description={
              <>
                Try: <em>First Visit → Follow-Up → Membership → Serve Team</em> — or define your own pathway.
              </>
            }
            action={
              canManage ? (
                <Link href="/journeys/new" className={buttonClasses("primary", "sm")}>
                  <Plus size={15} /> New journey
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
                  <th className="px-5 py-3 font-medium">Journey</th>
                  <th className="px-5 py-3 font-medium">Milestones</th>
                  <th className="px-5 py-3 font-medium">Active enrollments</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {journeys.map((journey) => (
                  <tr key={journey.id} className="border-b border-border/60 last:border-0 hover:bg-surface-muted">
                    <td className="px-5 py-3">
                      <Link href={`/journeys/${journey.id}`} className="font-medium text-ink hover:text-accent">
                        {journey.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">{journey.milestones.length}</td>
                    <td className="px-5 py-3 text-ink-secondary">{journey._count.enrollments}</td>
                    <td className="px-5 py-3">
                      {journey.isActive ? <Badge variant="success">Open</Badge> : <Badge variant="warning">Closed</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
