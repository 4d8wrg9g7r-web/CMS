import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, CircleX, Clock, RotateCcw, XCircle } from "lucide-react";
import { personDisplayName, workflowService } from "@cms/database";
import { Badge } from "../../../../../../components/ui/Badge";
import { buttonClasses } from "../../../../../../components/ui/Button";
import { Card } from "../../../../../../components/ui/Card";
import { runStatusLabel, runStatusTone, stepTypeLabel } from "../../../../../../lib/workflows-format";
import { canWorkflows, requireWorkflows } from "../../../../../../lib/workflows-access";
import { getCurrentOrganization } from "../../../../../../lib/session";
import { cancelRunAction, retryRunAction } from "../../../actions";

interface LogEntry {
  step: number;
  type: string;
  status: "completed" | "waiting" | "retrying" | "failed" | "cancelled";
  at: string;
  detail?: string;
}

function entryIcon(status: LogEntry["status"]) {
  switch (status) {
    case "completed":
      return <CheckCircle2 size={15} className="text-success" />;
    case "waiting":
      return <Clock size={15} className="text-accent" />;
    case "retrying":
      return <RotateCcw size={15} className="text-warning" />;
    case "failed":
      return <XCircle size={15} className="text-danger" />;
    default:
      return <CircleX size={15} className="text-ink-muted" />;
  }
}

export default async function WorkflowRunPage({
  params,
}: {
  params: Promise<{ workflowId: string; runId: string }>;
}) {
  const organization = await getCurrentOrganization();
  if (!organization) return null;
  await requireWorkflows(organization.id, "workflow.view");
  const canManage = await canWorkflows(organization.id, "workflow.manage");

  const { workflowId, runId } = await params;
  const run = await workflowService.getRun(organization.id, runId);
  if (!run || run.workflowId !== workflowId) notFound();

  const log = (Array.isArray(run.log) ? run.log : []) as unknown as LogEntry[];
  const cancellable = ["PENDING", "WAITING", "RUNNING"].includes(run.status);

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/workflows/${workflowId}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink"
      >
        <ArrowLeft size={15} /> Back to {run.workflow.name}
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Run</h1>
        <Badge variant={runStatusTone(run.status)}>{runStatusLabel(run.status)}</Badge>
        <span className="text-sm text-ink-muted">
          {new Date(run.createdAt).toLocaleString()} · v{run.version}
        </span>
      </div>

      <Card padding="sm" className="mb-4">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-muted">Person</dt>
            <dd className="mt-0.5 text-ink">
              {run.person ? (
                <Link href={`/people/${run.person.id}`} className="hover:text-accent">
                  {personDisplayName(run.person)}
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-muted">Next due</dt>
            <dd className="mt-0.5 text-ink">
              {run.status === "WAITING" ? new Date(run.nextStepAt).toLocaleString() : "—"}
            </dd>
          </div>
          {run.lastError && (
            <div className="col-span-2">
              <dt className="text-xs uppercase tracking-wide text-ink-muted">Last error</dt>
              <dd className="mt-0.5 text-danger">{run.lastError}</dd>
            </div>
          )}
        </dl>
      </Card>

      {/* Timeline — §39 observability: trigger, steps, outputs, failures, retries. */}
      <Card padding="md" className="mb-4">
        <h2 className="mb-4 text-sm font-semibold text-ink">Timeline</h2>
        {log.length === 0 ? (
          <p className="text-sm text-ink-muted">No steps have executed yet.</p>
        ) : (
          <ol className="space-y-3">
            {log.map((entry, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 shrink-0">{entryIcon(entry.status)}</span>
                <div>
                  <p className="text-ink">
                    {entry.type === "END" ? "Workflow completed" : `Step ${entry.step + 1}: ${stepTypeLabel(entry.type)}`}
                    <span className="ml-2 text-xs text-ink-muted">{new Date(entry.at).toLocaleString()}</span>
                  </p>
                  {entry.detail && <p className="text-xs text-ink-secondary">{entry.detail}</p>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {canManage && (cancellable || run.status === "FAILED") && (
        <div className="flex gap-3">
          {cancellable && (
            <form action={cancelRunAction.bind(null, workflowId, runId)}>
              <button type="submit" className={buttonClasses("danger", "sm")}>
                Cancel run
              </button>
            </form>
          )}
          {run.status === "FAILED" && (
            <form action={retryRunAction.bind(null, workflowId, runId)}>
              <button type="submit" className={buttonClasses("secondary", "sm")}>
                <RotateCcw size={14} /> Retry from failed step
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
