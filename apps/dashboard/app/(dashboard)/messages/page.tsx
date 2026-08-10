import Link from "next/link";
import { Lock, Mail, RotateCcw } from "lucide-react";
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
        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-ink">Messages</h1>
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
  const messages = await messageService.listMessages(organization.id, { status, source });

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-ink">Messages</h1>
        <p className="text-sm text-ink-secondary">
          Every email the platform sends — from workflows, form notifications, and resends — with delivery status.
        </p>
      </div>

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
