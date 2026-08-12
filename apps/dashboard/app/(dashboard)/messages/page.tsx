import Link from "next/link";
import { Lock, Mail, PenSquare, RotateCcw } from "lucide-react";
import { messageService, personDisplayName, type MessageStatus } from "@cms/database";
import { Badge } from "../../../components/ui/Badge";
import { buttonClasses } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Select } from "../../../components/ui/Input";
import { canMessages } from "../../../lib/messages-access";
import { getCurrentOrganization } from "../../../lib/session";
import { resendMessageAction } from "./actions";

const STATUS_OPTIONS: { value: MessageStatus; label: string }[] = [
  { value: "QUEUED", label: "Queued" },
  { value: "SENT", label: "Sent" },
  { value: "FAILED", label: "Failed" },
];

const SOURCE_LABELS: Record<string, string> = {
  workflow: "Workflow",
  form_notification: "Form notification",
  manual_resend: "Manual resend",
  blast: "Email blast",
};

function statusTone(status: MessageStatus): "success" | "warning" | "danger" | "neutral" {
  return status === "SENT" ? "success" : status === "FAILED" ? "danger" : "neutral";
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; source?: string }>;
}) {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  const [canView, canManage] = await Promise.all([
    canMessages(organization.id, "message.view"),
    canMessages(organization.id, "message.manage"),
  ]);

  if (!canView) {
    return (
      <div>
        <h1 className="mb-1 text-display text-[28px] leading-tight text-ink">Messages</h1>
        <Card padding="md" className="mt-6">
          <EmptyState
            icon={<Lock size={22} />}
            title="You don't have access to Messages"
            description="The communication log is restricted to organization owners and admins."
          />
        </Card>
      </div>
    );
  }

  const params = await searchParams;
  const status = (params.status as MessageStatus | undefined) || undefined;
  const source = params.source || undefined;
  const [messages, blasts] = await Promise.all([
    messageService.listMessages(organization.id, { status, source }),
    messageService.listEmailBlasts(organization.id, 10),
  ]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="mb-1 text-display text-[28px] leading-tight text-ink">Messages</h1>
          <p className="text-sm text-ink-secondary">
            Every email the platform sends — from workflows, form notifications, and resends — with delivery status.
          </p>
        </div>
        {canManage && (
          <Link href="/messages/new" className={buttonClasses("primary", "md")}>
            <PenSquare size={15} /> New email
          </Link>
        )}
      </div>

      {blasts.length > 0 && (
        <Card padding="md" className="mb-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">Newsletters &amp; blasts</h2>
          <ul className="divide-y divide-border text-sm">
            {blasts.map((blast) => (
              <li key={blast.id}>
                <Link
                  href={`/messages/blasts/${blast.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 hover:bg-surface-muted"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium text-ink">{blast.subject}</span>
                    {blast._count.attachments > 0 && (
                      <span className="shrink-0 text-xs text-ink-muted">
                        {blast._count.attachments} attachment{blast._count.attachments === 1 ? "" : "s"}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-ink-secondary">
                    {blast.sentCount} sent
                    {blast.queuedCount > 0 && ` · ${blast.queuedCount} sending`}
                    {blast.failedCount > 0 && ` · ${blast.failedCount} failed`}
                    {blast.suppressedCount > 0 && ` · ${blast.suppressedCount} suppressed`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card padding="sm" className="mb-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-ink-secondary">
            Status
            <Select name="status" defaultValue={status ?? ""} className="mt-1 w-40">
              <option value="">All</option>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-sm text-ink-secondary">
            Source
            <Select name="source" defaultValue={source ?? ""} className="mt-1 w-48">
              <option value="">All sources</option>
              {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
          <button type="submit" className={buttonClasses("secondary", "md")}>
            Apply
          </button>
        </form>
      </Card>

      {messages.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<Mail size={22} />}
            title={status || source ? "No messages match your filters" : "No messages yet"}
            description="Messages appear here when workflows or form notifications send email."
          />
        </Card>
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-5 py-3 font-medium">To</th>
                  <th className="px-5 py-3 font-medium">Subject</th>
                  <th className="px-5 py-3 font-medium">Source</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">When</th>
                  {canManage && <th className="px-5 py-3" />}
                </tr>
              </thead>
              <tbody>
                {messages.map((message) => (
                  <tr key={message.id} className="border-b border-border/60 last:border-0 hover:bg-surface-muted">
                    <td className="px-5 py-3">
                      {message.toPerson ? (
                        <Link href={`/people/${message.toPerson.id}`} className="text-ink hover:text-accent">
                          {personDisplayName(message.toPerson)}
                        </Link>
                      ) : (
                        <span className="text-ink">{message.toEmail}</span>
                      )}
                      {message.toPerson && <span className="block text-xs text-ink-muted">{message.toEmail}</span>}
                    </td>
                    <td className="max-w-64 truncate px-5 py-3 text-ink-secondary" title={message.subject}>
                      {message.subject}
                    </td>
                    <td className="px-5 py-3 text-ink-secondary">{SOURCE_LABELS[message.source] ?? message.source}</td>
                    <td className="px-5 py-3">
                      <Badge variant={statusTone(message.status)}>{message.status.toLowerCase()}</Badge>
                      {message.error && (
                        <span className="block max-w-56 truncate text-xs text-danger" title={message.error}>
                          {message.error}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-ink-muted">
                      {new Date(message.sentAt ?? message.createdAt).toLocaleString()}
                    </td>
                    {canManage && (
                      <td className="px-5 py-3">
                        {message.status === "FAILED" && !message.error?.startsWith("Suppressed") && (
                          <form action={resendMessageAction.bind(null, message.id)}>
                            <button type="submit" className={buttonClasses("ghost", "sm")}>
                              <RotateCcw size={13} /> Resend
                            </button>
                          </form>
                        )}
                      </td>
                    )}
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
