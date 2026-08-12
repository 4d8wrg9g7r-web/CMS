import { GroupPostKind, MembershipStatus, OutboxStatus, WorkflowRunStatus } from "@prisma/client";
import { tenantDb } from "../client";
import { personDisplayName } from "../people/helpers";

/**
 * The operational Inbox (docs/design-system.md "Inbox"): one feed of things
 * that happened, DERIVED from the tables that already record them — nothing
 * is written when events occur, so the inbox can never drift from the truth.
 * "Action required" items block something; "updates" are worth knowing.
 * Resolving stores an org-wide dismissal key so the feed stays quiet.
 */

export type InboxGroup = "action" | "update";

export interface InboxItem {
  /** Stable derived key — also the dismissal key. */
  key: string;
  kind:
    | "automation_failed"
    | "delivery_failed"
    | "form_submission"
    | "event_registration"
    | "new_person"
    | "prayer_request";
  group: InboxGroup;
  text: string;
  detail: string | null;
  at: Date;
  href: string;
}

const DAY = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 14;
const TAKE = 25;

export interface InboxInclude {
  people?: boolean;
  groups?: boolean;
  events?: boolean;
  forms?: boolean;
  workflows?: boolean;
  messages?: boolean;
}

export async function listInbox(
  organizationId: string,
  include: InboxInclude,
  now: Date = new Date(),
): Promise<{ action: InboxItem[]; updates: InboxItem[] }> {
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY);

  const [dismissals, failedRuns, failedOutbox, submissions, registrations, newPeople, prayers] = await Promise.all([
    tenantDb.inboxDismissal.findMany({ where: { organizationId }, select: { itemKey: true } }),
    include.workflows
      ? tenantDb.workflowRun.findMany({
          where: { organizationId, status: WorkflowRunStatus.FAILED, updatedAt: { gte: since } },
          include: { workflow: { select: { name: true } } },
          orderBy: { updatedAt: "desc" },
          take: TAKE,
        })
      : [],
    include.messages
      ? tenantDb.outboxEvent.findMany({
          where: { organizationId, status: OutboxStatus.FAILED },
          orderBy: { updatedAt: "desc" },
          take: TAKE,
        })
      : [],
    include.forms
      ? tenantDb.formSubmission.findMany({
          where: { organizationId, createdAt: { gte: since } },
          include: { form: { select: { title: true } } },
          orderBy: { createdAt: "desc" },
          take: TAKE,
        })
      : [],
    include.events
      ? tenantDb.eventRegistration.findMany({
          where: { organizationId, createdAt: { gte: since } },
          include: { event: { select: { title: true } } },
          orderBy: { createdAt: "desc" },
          take: TAKE,
        })
      : [],
    include.people
      ? tenantDb.person.findMany({
          where: { organizationId, archivedAt: null, createdAt: { gte: since } },
          orderBy: { createdAt: "desc" },
          take: TAKE,
        })
      : [],
    include.groups
      ? tenantDb.groupPost.findMany({
          where: { organizationId, kind: GroupPostKind.PRAYER, createdAt: { gte: since }, hiddenAt: null },
          include: { group: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
          take: TAKE,
        })
      : [],
  ]);

  const dismissed = new Set(dismissals.map((d) => d.itemKey));

  const action: InboxItem[] = [
    ...failedRuns.map(
      (run): InboxItem => ({
        key: `run:${run.id}`,
        kind: "automation_failed",
        group: "action",
        text: `Automation “${run.workflow.name}” failed`,
        detail: `Attempt ${run.attempts}`,
        at: run.updatedAt,
        href: `/workflows/${run.workflowId}/runs/${run.id}`,
      }),
    ),
    ...failedOutbox.map(
      (event): InboxItem => ({
        key: `outbox:${event.id}`,
        kind: "delivery_failed",
        group: "action",
        text: "A delivery couldn't be sent",
        detail: event.lastError?.slice(0, 120) ?? event.type,
        at: event.updatedAt,
        href: "/messages",
      }),
    ),
  ];

  const updates: InboxItem[] = [
    ...submissions.map(
      (submission): InboxItem => ({
        key: `submission:${submission.id}`,
        kind: "form_submission",
        group: "update",
        text: `New “${submission.form.title}” submission`,
        detail: null,
        at: submission.createdAt,
        href: `/forms/${submission.formId}/submissions/${submission.id}`,
      }),
    ),
    ...registrations.map(
      (registration): InboxItem => ({
        key: `registration:${registration.id}`,
        kind: "event_registration",
        group: "update",
        text: `${registration.name} registered for ${registration.event.title}`,
        detail: null,
        at: registration.createdAt,
        href: `/events/${registration.eventId}`,
      }),
    ),
    ...newPeople.map(
      (person): InboxItem => ({
        key: `person:${person.id}`,
        kind: "new_person",
        group: "update",
        text: `${personDisplayName(person)} was added${person.membershipStatus === MembershipStatus.VISITOR ? " as a visitor" : ""}`,
        detail: person.email ?? null,
        at: person.createdAt,
        href: `/people/${person.id}`,
      }),
    ),
    ...prayers.map(
      (post): InboxItem => ({
        key: `prayer:${post.id}`,
        kind: "prayer_request",
        group: "update",
        // Anonymity is honored here exactly as in the group space.
        text: `New prayer request in ${post.group.name}`,
        detail: post.anonymous ? null : post.body.slice(0, 120),
        at: post.createdAt,
        href: `/groups/${post.group.id}?tab=community`,
      }),
    ),
  ];

  const live = (items: InboxItem[]) =>
    items.filter((i) => !dismissed.has(i.key)).sort((a, b) => b.at.getTime() - a.at.getTime());

  return { action: live(action), updates: live(updates) };
}

/** Org-wide resolve: one staffer clearing an item clears it for everyone. Idempotent. */
export async function resolveInboxItem(organizationId: string, itemKey: string, userId?: string): Promise<void> {
  const existing = await tenantDb.inboxDismissal.findFirst({ where: { organizationId, itemKey } });
  if (existing) return;
  await tenantDb.inboxDismissal.create({
    data: { organizationId, itemKey: itemKey.slice(0, 200), dismissedByUserId: userId ?? null },
  });
}

/**
 * Count of undismissed action-required items — the sidebar badge. Kept to
 * three cheap queries (it runs in the layout on every page), which can
 * overcount only when a dismissal targets an item outside the window.
 */
export async function countActionRequired(organizationId: string, now: Date = new Date()): Promise<number> {
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY);
  const [failedRuns, failedOutbox, dismissals] = await Promise.all([
    tenantDb.workflowRun.findMany({
      where: { organizationId, status: WorkflowRunStatus.FAILED, updatedAt: { gte: since } },
      select: { id: true },
      take: TAKE,
    }),
    tenantDb.outboxEvent.findMany({
      where: { organizationId, status: OutboxStatus.FAILED },
      select: { id: true },
      take: TAKE,
    }),
    tenantDb.inboxDismissal.findMany({ where: { organizationId }, select: { itemKey: true } }),
  ]);
  const dismissed = new Set(dismissals.map((d) => d.itemKey));
  return (
    failedRuns.filter((r) => !dismissed.has(`run:${r.id}`)).length +
    failedOutbox.filter((e) => !dismissed.has(`outbox:${e.id}`)).length
  );
}
