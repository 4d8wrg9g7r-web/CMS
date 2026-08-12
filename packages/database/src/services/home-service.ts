import { EventRegistrationStatus, MembershipStatus, TaskStatus, WorkflowRunStatus, OutboxStatus } from "@prisma/client";
import { tenantDb } from "../client";
import { nextOccurrence } from "../events/helpers";

/**
 * The Home brief (docs/design-system.md "Home"): what needs attention, what's
 * happening this week, how the church is doing, and what's worth acting on.
 * Everything here is deterministic — counts and comparisons from real data,
 * each with one obvious action. No generative anything: Home must never say
 * something the database can't back.
 */

export interface AttentionItem {
  key: string;
  text: string;
  actionLabel: string;
  href: string;
}

export interface WeekItem {
  id: string;
  title: string;
  when: Date;
  location: string | null;
  registered: number;
  capacity: number | null;
}

export interface PulseMetric {
  key: "people" | "attendance" | "giving" | "groups";
  label: string;
  /** Current-period value; cents when format is "currency". */
  current: number;
  /** Prior-period value for the delta; null = no comparison shown. */
  previous: number | null;
  format: "number" | "currency";
  helper: string;
}

export interface HomeInsight {
  key: string;
  text: string;
  actionLabel: string;
  href: string;
}

export interface HomeBrief {
  attention: AttentionItem[];
  week: WeekItem[];
  birthdayCount: number;
  pulse: PulseMetric[];
  insights: HomeInsight[];
}

const DAY = 24 * 60 * 60 * 1000;

function monthRange(now: Date, monthsBack: number): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 1);
  return { start, end };
}

async function givingCentsBetween(organizationId: string, start: Date, end: Date): Promise<number> {
  const sum = await tenantDb.contribution.aggregate({
    where: { organizationId, receivedAt: { gte: start, lt: end } },
    _sum: { amountCents: true },
  });
  return sum._sum.amountCents ?? 0;
}

export async function getHomeBrief(organizationId: string, now: Date = new Date()): Promise<HomeBrief> {
  const weekEnd = new Date(now.getTime() + 7 * DAY);
  const d30 = new Date(now.getTime() - 30 * DAY);
  const d60 = new Date(now.getTime() - 60 * DAY);
  const d7 = new Date(now.getTime() - 7 * DAY);

  const [
    overdueTasks,
    failedRuns,
    failedOutbox,
    newVisitors7d,
    site,
    events,
    people30d,
    people60d,
    checkins30d,
    checkins60d,
    givingThisMonth,
    givingLastMonth,
    groupCount,
    memberCount,
    fullGroups,
    recentVisitors,
    birthdayPeople,
    activeCampaigns,
    givingMonths,
  ] = await Promise.all([
    tenantDb.task.count({
      where: { organizationId, status: { in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS] }, dueAt: { lt: now } },
    }),
    tenantDb.workflowRun.count({
      where: { organizationId, status: WorkflowRunStatus.FAILED, updatedAt: { gte: d30 } },
    }),
    tenantDb.outboxEvent.count({ where: { organizationId, status: OutboxStatus.FAILED } }),
    tenantDb.person.count({
      where: { organizationId, archivedAt: null, membershipStatus: MembershipStatus.VISITOR, createdAt: { gte: d7 } },
    }),
    tenantDb.site.findFirst({ where: { organizationId }, select: { published: true } }),
    tenantDb.event.findMany({
      where: { organizationId, archivedAt: null },
      include: { _count: { select: { registrations: { where: { status: EventRegistrationStatus.REGISTERED } } } } },
    }),
    tenantDb.person.count({ where: { organizationId, archivedAt: null, createdAt: { gte: d30 } } }),
    tenantDb.person.count({ where: { organizationId, archivedAt: null, createdAt: { gte: d60, lt: d30 } } }),
    tenantDb.checkIn.count({ where: { organizationId, checkedInAt: { gte: d30 } } }),
    tenantDb.checkIn.count({ where: { organizationId, checkedInAt: { gte: d60, lt: d30 } } }),
    givingCentsBetween(organizationId, monthRange(now, 0).start, monthRange(now, 0).end),
    givingCentsBetween(organizationId, monthRange(now, 1).start, monthRange(now, 1).end),
    tenantDb.group.count({ where: { organizationId, archivedAt: null } }),
    tenantDb.groupMembership.count({ where: { organizationId } }),
    tenantDb.group.findMany({
      where: { organizationId, archivedAt: null, capacity: { not: null } },
      select: { id: true, name: true, capacity: true, _count: { select: { memberships: true } } },
      take: 200,
    }),
    tenantDb.person.findMany({
      where: { organizationId, archivedAt: null, membershipStatus: MembershipStatus.VISITOR, createdAt: { gte: d60 } },
      select: { id: true },
      take: 500,
    }),
    tenantDb.person.findMany({
      where: { organizationId, archivedAt: null, birthdate: { not: null } },
      select: { birthdate: true },
      take: 2000,
    }),
    tenantDb.campaign.findMany({
      where: { organizationId, archivedAt: null, startsAt: { lte: now } },
      take: 20,
    }),
    Promise.all(
      [3, 2, 1].map(async (back) => {
        const { start, end } = monthRange(now, back);
        return givingCentsBetween(organizationId, start, end);
      }),
    ),
  ]);

  // ----- Needs attention: only what a staffer can act on right now. -----
  const attention: AttentionItem[] = [];
  if (newVisitors7d > 0) {
    attention.push({
      key: "visitors",
      text: `${newVisitors7d} new ${newVisitors7d === 1 ? "visitor" : "visitors"} this week`,
      actionLabel: "Review follow-ups",
      href: "/people?status=VISITOR",
    });
  }
  if (overdueTasks > 0) {
    attention.push({
      key: "tasks",
      text: `${overdueTasks} ${overdueTasks === 1 ? "task is" : "tasks are"} overdue`,
      actionLabel: "Open tasks",
      href: "/tasks",
    });
  }
  if (failedRuns > 0) {
    attention.push({
      key: "automations",
      text: `${failedRuns} ${failedRuns === 1 ? "automation" : "automations"} failed recently`,
      actionLabel: "Review",
      href: "/workflows",
    });
  }
  if (failedOutbox > 0) {
    attention.push({
      key: "outbox",
      text: `${failedOutbox} ${failedOutbox === 1 ? "delivery" : "deliveries"} couldn't be sent`,
      actionLabel: "Open messages",
      href: "/messages",
    });
  }
  if (site && !site.published) {
    attention.push({
      key: "website",
      text: "Your website is still a draft",
      actionLabel: "Preview & publish",
      href: "/website",
    });
  }

  // ----- This week: expanded occurrences inside the next 7 days. -----
  const week: WeekItem[] = events
    .map((event) => ({ event, next: nextOccurrence(event, now) }))
    .filter((e): e is { event: (typeof events)[number]; next: Date } => e.next !== null && e.next < weekEnd)
    .sort((a, b) => a.next.getTime() - b.next.getTime())
    .slice(0, 8)
    .map(({ event, next }) => ({
      id: event.id,
      title: event.title,
      when: next,
      location: event.location ?? null,
      registered: event._count.registrations,
      capacity: event.capacity ?? null,
    }));

  // Near-capacity events are worth a nudge before Sunday, not after.
  for (const item of week) {
    if (item.capacity && item.registered >= item.capacity * 0.8) {
      attention.push({
        key: `capacity:${item.id}`,
        text: `${item.title} is ${item.registered >= item.capacity ? "full" : "nearly full"} (${item.registered}/${item.capacity})`,
        actionLabel: "Open event",
        href: `/events/${item.id}`,
      });
    }
  }

  const birthdayCount = birthdayPeople.filter((p) => {
    if (!p.birthdate) return false;
    const b = new Date(p.birthdate);
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getTime() + i * DAY);
      if (b.getMonth() === d.getMonth() && b.getDate() === d.getDate()) return true;
    }
    return false;
  }).length;

  // ----- Church pulse: four numbers, each against its prior period. -----
  const pulse: PulseMetric[] = [
    { key: "attendance", label: "Check-ins", current: checkins30d, previous: checkins60d, format: "number", helper: "Last 30 days" },
    { key: "people", label: "New people", current: people30d, previous: people60d, format: "number", helper: "Last 30 days" },
    { key: "giving", label: "Giving", current: givingThisMonth, previous: givingLastMonth, format: "currency", helper: "This month" },
    { key: "groups", label: "Groups", current: groupCount, previous: null, format: "number", helper: `${memberCount} memberships` },
  ];

  // ----- Insights: rules over real data, each with an action. -----
  const insights: HomeInsight[] = [];

  const visitorIds = recentVisitors.map((v) => v.id);
  if (visitorIds.length > 0) {
    const followedUp = await tenantDb.task.findMany({
      where: { organizationId, relatedPersonId: { in: visitorIds } },
      select: { relatedPersonId: true },
    });
    const covered = new Set(followedUp.map((t) => t.relatedPersonId));
    const uncovered = visitorIds.filter((id) => !covered.has(id)).length;
    if (uncovered > 0) {
      insights.push({
        key: "visitor-followup",
        text: `${uncovered} recent ${uncovered === 1 ? "visitor doesn't" : "visitors don't"} have a follow-up task yet.`,
        actionLabel: "View people",
        href: "/people?status=VISITOR",
      });
    }
  }

  for (const campaign of activeCampaigns.slice(0, 3)) {
    const raised = await tenantDb.contribution.aggregate({
      where: {
        organizationId,
        fundId: campaign.fundId,
        receivedAt: { gte: campaign.startsAt, ...(campaign.endsAt ? { lte: campaign.endsAt } : {}) },
      },
      _sum: { amountCents: true },
    });
    const pct = campaign.goalCents > 0 ? Math.round(((raised._sum.amountCents ?? 0) / campaign.goalCents) * 100) : 0;
    if (pct >= 75) {
      insights.push({
        key: `campaign:${campaign.id}`,
        text: `${campaign.name} has reached ${Math.min(pct, 100)}% of its goal.`,
        actionLabel: "View campaign",
        href: `/giving/campaigns/${campaign.id}`,
      });
    }
    if (campaign.endsAt) {
      const daysLeft = Math.ceil((campaign.endsAt.getTime() - now.getTime()) / DAY);
      if (daysLeft > 0 && daysLeft <= 14) {
        insights.push({
          key: `campaign-ending:${campaign.id}`,
          text: `${campaign.name} ends in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}.`,
          actionLabel: "Send an update",
          href: "/messages/new",
        });
      }
    }
  }

  const [m3, m2, m1] = givingMonths;
  if ((m3 ?? 0) > 0 && (m2 ?? 0) > (m3 ?? 0) && (m1 ?? 0) > (m2 ?? 0)) {
    insights.push({
      key: "giving-streak",
      text: "Giving has increased three months in a row.",
      actionLabel: "Open giving",
      href: "/giving",
    });
  }

  const atCapacity = fullGroups.filter((g) => g.capacity !== null && g._count.memberships >= g.capacity);
  if (atCapacity.length > 0) {
    insights.push({
      key: "groups-full",
      text: `${atCapacity.length} ${atCapacity.length === 1 ? "group is" : "groups are"} at capacity — room to start new ones.`,
      actionLabel: "View groups",
      href: "/groups",
    });
  }

  return { attention, week, birthdayCount, pulse, insights };
}
