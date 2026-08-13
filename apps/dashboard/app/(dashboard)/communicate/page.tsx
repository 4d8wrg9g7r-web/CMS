import Link from "next/link";
import { ClipboardList, Mail, Plus } from "lucide-react";
import { formService, messageService } from "@cms/database";
import { Badge } from "../../../components/ui/Badge";
import { Card } from "../../../components/ui/Card";
import { PageHeader } from "../../../components/ui/PageHeader";
import { canMessages } from "../../../lib/messages-access";
import { canForms } from "../../../lib/forms-access";
import { timeAgo } from "../../../lib/format";
import { getCurrentOrganization } from "../../../lib/session";

/**
 * Communicate (docs/design-system.md "Navigation"): the workspace for
 * reaching people — messages and forms. Automations, journeys, and tasks
 * live under the Management nav group; this landing stays focused on
 * outbound communication.
 */
export default async function CommunicatePage() {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  const [messagesOk, formsOk] = await Promise.all([
    canMessages(organization.id, "message.view"),
    canForms(organization.id, "form.view"),
  ]);

  const [blasts, forms] = await Promise.all([
    messagesOk ? messageService.listEmailBlasts(organization.id, 5) : [],
    formsOk ? formService.listForms(organization.id) : [],
  ]);

  const publishedForms = forms.filter((f) => f.status === "PUBLISHED").length;

  // Role-aware creation tiles: only show what this viewer can actually do.
  const CREATE = [
    { label: "Send a message", desc: "Email your people — everyone, a filter, or a group.", href: "/messages/new", icon: <Mail size={18} />, show: messagesOk },
    { label: "Build a form", desc: "Plan-a-visit, sign-ups, prayer requests.", href: "/forms/new", icon: <ClipboardList size={18} />, show: formsOk },
  ].filter((c) => c.show);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Communicate" subtitle="Reach the right people at the right time." />

      {CREATE.length > 0 && (
        <div className="mb-10 grid gap-4 sm:grid-cols-2" data-section="communicate-create">
          {CREATE.map((c) => (
            <Link key={c.href} href={c.href} className="group block">
              <Card padding="md" interactive className="h-full">
                <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-surface-warm text-accent">
                  {c.icon}
                </span>
                <p className="flex items-center gap-1.5 text-[15px] font-semibold text-ink group-hover:text-accent">
                  <Plus size={14} className="text-ink-muted group-hover:text-accent" /> {c.label}
                </p>
                <p className="mt-1 text-sm text-ink-muted">{c.desc}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {messagesOk && (
          <Card padding="none" data-section="communicate-recent">
            <div className="flex items-center justify-between px-6 pb-1 pt-5">
              <h2 className="text-sm font-semibold text-ink">Recently sent</h2>
              <Link href="/messages" className="text-xs font-medium text-accent hover:text-accent-dark">
                All messages →
              </Link>
            </div>
            {blasts.length === 0 ? (
              <p className="px-6 pb-5 pt-2 text-sm text-ink-muted">Nothing sent yet — your first message is one click away.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {blasts.map((blast) => (
                  <li key={blast.id}>
                    <Link href={`/messages/blasts/${blast.id}`} className="flex items-center justify-between gap-3 px-6 py-3 hover:bg-surface-muted">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">{blast.subject}</span>
                        <span className="text-xs text-ink-muted">
                          {blast.sentCount} sent
                          {blast.failedCount > 0 ? ` · ${blast.failedCount} failed` : ""} · {timeAgo(blast.createdAt)}
                        </span>
                      </span>
                      {blast.failedCount > 0 && <Badge variant="warning">Check</Badge>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {formsOk && (
          <Card padding="md" data-section="communicate-summary">
            <h2 className="mb-4 text-sm font-semibold text-ink">At a glance</h2>
            <Link href="/forms" className="group inline-block">
              <p className="text-metric text-[28px] leading-none text-ink group-hover:text-accent">{publishedForms}</p>
              <p className="mt-1.5 text-sm text-ink-secondary">{publishedForms === 1 ? "form" : "forms"} live</p>
            </Link>
          </Card>
        )}
      </div>
    </div>
  );
}
