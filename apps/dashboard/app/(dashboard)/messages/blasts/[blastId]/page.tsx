import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, Mail, Paperclip } from "lucide-react";
import { campusService, describeAudience, groupService, messageService, type BlastAudience } from "@cms/database";
import { markdownToEmailBody } from "@cms/email";
import { Badge } from "../../../../../components/ui/Badge";
import { Card } from "../../../../../components/ui/Card";
import { EmptyState } from "../../../../../components/ui/EmptyState";
import { canMessages } from "../../../../../lib/messages-access";
import { getCurrentOrganization } from "../../../../../lib/session";
import { timeAgo } from "../../../../../lib/format";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function BlastDetailPage({ params }: { params: Promise<{ blastId: string }> }) {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  if (!(await canMessages(organization.id, "message.view"))) {
    return (
      <Card padding="md" className="mt-6">
        <EmptyState icon={<Lock size={22} />} title="You don't have access to Messages" description="" />
      </Card>
    );
  }

  const { blastId } = await params;
  const blast = await messageService.getEmailBlast(organization.id, blastId);
  if (!blast) notFound();

  const audience = blast.audience as unknown as BlastAudience;
  let campusName: string | null = null;
  let groupName: string | null = null;
  if (audience.kind === "filter" && audience.campusId) {
    const campuses = await campusService.listCampuses(organization.id, { includeArchived: true });
    campusName = campuses.find((c) => c.id === audience.campusId)?.name ?? null;
  }
  if (audience.kind === "group") {
    const groups = await groupService.listGroups(organization.id);
    groupName = groups.find((g) => g.id === audience.groupId)?.name ?? null;
  }

  const allDelivered = blast.queuedCount === 0;

  return (
    <div>
      <Link href="/messages" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
        <ArrowLeft size={14} /> Back to Messages
      </Link>

      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{blast.subject}</h1>
        <Badge variant={blast.failedCount > 0 ? "warning" : allDelivered ? "success" : "info"}>
          {allDelivered ? "Delivered" : "Sending"}
        </Badge>
      </div>
      <p className="mb-6 text-sm text-ink-secondary">
        To: {describeAudience(audience, { campusName, groupName })} · sent{" "}
        {blast.createdBy?.name || blast.createdBy?.email ? `by ${blast.createdBy.name || blast.createdBy.email} ` : ""}
        {timeAgo(blast.createdAt)}
      </p>

      <div className="mb-6 grid gap-6 lg:grid-cols-4">
        <Card padding="md">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Sent</p>
          <p className="mt-1 text-2xl font-bold text-ink">{blast.sentCount}</p>
        </Card>
        <Card padding="md">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Still sending</p>
          <p className="mt-1 text-2xl font-bold text-ink">{blast.queuedCount}</p>
        </Card>
        <Card padding="md">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Failed</p>
          <p className={`mt-1 text-2xl font-bold ${blast.failedCount > 0 ? "text-danger" : "text-ink"}`}>
            {blast.failedCount}
          </p>
        </Card>
        <Card padding="md">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Skipped</p>
          <p className="mt-1 text-sm text-ink-secondary">
            {blast.suppressedCount} opted out
            <br />
            {blast.noEmailCount} without email
          </p>
        </Card>
      </div>

      {blast.failures.length > 0 && (
        <Card padding="md" className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-ink">Failures</h2>
          <ul className="space-y-1 text-xs text-danger">
            {blast.failures.map((f, i) => (
              <li key={i}>
                {f.toEmail}: {f.error ?? "unknown error"}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-muted">
            Individual failures can be resent from the message log below once fixed.
          </p>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card padding="md" className="lg:col-span-2">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <Mail size={15} /> Email content
          </h2>
          {/* Safe: markdownToEmailBody escapes all input before transforming. */}
          <div className="rounded-lg border border-border bg-white p-5" dangerouslySetInnerHTML={{ __html: markdownToEmailBody(blast.bodyMarkdown) }} />
        </Card>
        <Card padding="md">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <Paperclip size={15} /> Attachments
          </h2>
          {blast.attachments.length === 0 ? (
            <p className="text-sm text-ink-muted">None</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {blast.attachments.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-ink">{a.fileName}</span>
                  <span className="shrink-0 text-xs text-ink-muted">{formatBytes(a.sizeBytes)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
