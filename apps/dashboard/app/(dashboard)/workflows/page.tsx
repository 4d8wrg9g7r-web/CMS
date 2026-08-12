import Link from "next/link";
import { Lock, Plus, Workflow } from "lucide-react";
import { workflowService } from "@cms/database";
import { Badge } from "../../../components/ui/Badge";
import { buttonClasses } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { triggerLabel, workflowStatusLabel, workflowStatusTone } from "../../../lib/workflows-format";
import { canWorkflows } from "../../../lib/workflows-access";
import { getCurrentOrganization } from "../../../lib/session";

export default async function WorkflowsPage() {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  const [canView, canManage] = await Promise.all([
    canWorkflows(organization.id, "workflow.view"),
    canWorkflows(organization.id, "workflow.manage"),
  ]);

  if (!canView) {
    return (
      <div>
        <h1 className="mb-1 text-display text-[28px] leading-tight text-ink">Workflows</h1>
        <Card padding="md" className="mt-6">
          <EmptyState
            icon={<Lock size={22} />}
            title="You don't have access to Workflows"
            description="Automation is restricted to organization owners and admins."
          />
        </Card>
      </div>
    );
  }

  const workflows = await workflowService.listWorkflows(organization.id);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-display text-[28px] leading-tight text-ink">Workflows</h1>
          <p className="text-sm text-ink-secondary">
            Automate follow-up: when something happens, check conditions, then act.
          </p>
        </div>
        {canManage && (
          <Link href="/workflows/new" className={buttonClasses("primary", "md")}>
            <Plus size={16} /> New workflow
          </Link>
        )}
      </div>

      {workflows.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<Workflow size={22} />}
            title="No workflows yet"
            description={
              <>
                Try: <em>Connect Card submitted → add to a group → notify staff → wait 2 days → follow up.</em>
              </>
            }
            action={
              canManage ? (
                <Link href="/workflows/new" className={buttonClasses("primary", "sm")}>
                  <Plus size={15} /> New workflow
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
                  <th className="px-5 py-3 font-medium">Trigger</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Runs</th>
                  <th className="px-5 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {workflows.map((workflow) => (
                  <tr key={workflow.id} className="border-b border-border/60 last:border-0 hover:bg-surface-muted">
                    <td className="px-5 py-3">
                      <Link href={`/workflows/${workflow.id}`} className="font-medium text-ink hover:text-accent">
                        {workflow.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">{triggerLabel(workflow.trigger)}</td>
                    <td className="px-5 py-3">
                      <Badge variant={workflowStatusTone(workflow.status)}>{workflowStatusLabel(workflow.status)}</Badge>
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">{workflow._count.runs}</td>
                    <td className="px-5 py-3 text-ink-secondary">{new Date(workflow.updatedAt).toLocaleDateString()}</td>
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
