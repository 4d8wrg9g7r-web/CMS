import Link from "next/link";
import { AlertTriangle, Check, ChevronRight, Inbox as InboxIcon } from "lucide-react";
import { inboxService, type InboxItem } from "@cms/database";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { PageHeader } from "../../../components/ui/PageHeader";
import { canPeople } from "../../../lib/people-access";
import { canGroups } from "../../../lib/groups-access";
import { canEvents } from "../../../lib/events-access";
import { canForms } from "../../../lib/forms-access";
import { canWorkflows } from "../../../lib/workflows-access";
import { canMessages } from "../../../lib/messages-access";
import { timeAgo } from "../../../lib/format";
import { getCurrentOrganization } from "../../../lib/session";
import { resolveInboxItemAction } from "./actions";

/**
 * The Inbox (docs/design-system.md "Inbox"): the church's operational feed.
 * Action-required first (failed automations and deliveries), then updates
 * (submissions, registrations, new people, prayer requests) — every row
 * derived from real records, permission-filtered per module, resolvable
 * org-wide so the whole team shares one quiet feed.
 */
export default async function InboxPage() {
  const organization = await getCurrentOrganization();
  if (!organization) return null;

  const [people, groups, events, forms, workflows, messages] = await Promise.all([
    canPeople(organization.id, "person.view"),
    canGroups(organization.id, "group.view"),
    canEvents(organization.id, "event.view"),
    canForms(organization.id, "form.view"),
    canWorkflows(organization.id, "workflow.view"),
    canMessages(organization.id, "message.view"),
  ]);

  const { action, updates } = await inboxService.listInbox(organization.id, {
    people,
    groups,
    events,
    forms,
    workflows,
    messages,
  });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Inbox" subtitle="What's happened across your church — newest first, quiet once handled." />

      {action.length === 0 && updates.length === 0 ? (
        <Card padding="md">
          <EmptyState
            icon={<InboxIcon size={22} />}
            title="All clear"
            description="Form submissions, registrations, new people, prayer requests, and anything that breaks will land here."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-8">
          {action.length > 0 && (
            <section data-section="inbox-action">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                <AlertTriangle size={15} className="text-warning" /> Action required
              </h2>
              <Card padding="none">
                <ul className="divide-y divide-border">
                  {action.map((item) => (
                    <InboxRow key={item.key} item={item} />
                  ))}
                </ul>
              </Card>
            </section>
          )}

          {updates.length > 0 && (
            <section data-section="inbox-updates">
              <h2 className="mb-3 text-sm font-semibold text-ink">Updates</h2>
              <Card padding="none">
                <ul className="divide-y divide-border">
                  {updates.map((item) => (
                    <InboxRow key={item.key} item={item} />
                  ))}
                </ul>
              </Card>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function InboxRow({ item }: { item: InboxItem }) {
  return (
    <li className="flex items-center gap-3 px-5 py-3" data-inbox-item={item.kind}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.group === "action" ? "bg-warning" : "bg-accent/60"}`} />
      <div className="min-w-0 flex-1">
        <Link href={item.href} className="group flex items-center gap-1.5 text-[15px] text-ink hover:text-accent">
          <span className="truncate">{item.text}</span>
          <ChevronRight size={14} className="shrink-0 text-ink-muted transition-transform duration-180 group-hover:translate-x-0.5" />
        </Link>
        {item.detail && <p className="truncate text-sm text-ink-muted">{item.detail}</p>}
      </div>
      <span className="shrink-0 text-xs text-ink-muted">{timeAgo(item.at)}</span>
      <form action={resolveInboxItemAction.bind(null, item.key)}>
        <button
          type="submit"
          title="Resolve"
          aria-label={`Resolve: ${item.text}`}
          className="rounded-md p-1.5 text-ink-muted transition-colors duration-180 hover:bg-success-bg hover:text-success"
        >
          <Check size={16} />
        </button>
      </form>
    </li>
  );
}
