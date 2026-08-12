import { tenantDb } from "../client";
import { personDisplayName } from "../people/helpers";

/**
 * Global search behind the command palette (docs/design-system.md "Command
 * palette"). Small, bounded, tenant-scoped lookups — a few rows per entity
 * type, ranked by simple recency/name order. The caller (dashboard action)
 * decides which entity types the current staff role may see; this service
 * only ever searches what it's asked to.
 */

export interface SearchHit {
  id: string;
  /** Primary line, e.g. a person's name. */
  label: string;
  /** Secondary line, e.g. an email or a date. */
  sublabel: string | null;
}

export interface GlobalSearchInclude {
  people?: boolean;
  groups?: boolean;
  events?: boolean;
  forms?: boolean;
  sermons?: boolean;
  campaigns?: boolean;
  reports?: boolean;
}

export interface GlobalSearchResults {
  people: SearchHit[];
  groups: SearchHit[];
  events: SearchHit[];
  forms: SearchHit[];
  sermons: SearchHit[];
  campaigns: SearchHit[];
  reports: SearchHit[];
}

const TAKE = 5;

export async function globalSearch(
  organizationId: string,
  rawQuery: string,
  include: GlobalSearchInclude,
): Promise<GlobalSearchResults> {
  const query = rawQuery.trim().slice(0, 100);
  const empty: GlobalSearchResults = { people: [], groups: [], events: [], forms: [], sermons: [], campaigns: [], reports: [] };
  if (query.length < 2) return empty;
  const contains = { contains: query, mode: "insensitive" as const };

  const [people, groups, events, forms, sermons, campaigns, reports] = await Promise.all([
    include.people
      ? tenantDb.person.findMany({
          where: {
            organizationId,
            archivedAt: null,
            OR: [{ firstName: contains }, { lastName: contains }, { preferredName: contains }, { email: contains }],
          },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          take: TAKE,
        })
      : [],
    include.groups
      ? tenantDb.group.findMany({ where: { organizationId, name: contains }, orderBy: { name: "asc" }, take: TAKE })
      : [],
    include.events
      ? tenantDb.event.findMany({
          where: { organizationId, archivedAt: null, title: contains },
          orderBy: { startAt: "desc" },
          take: TAKE,
        })
      : [],
    include.forms
      ? tenantDb.formDefinition.findMany({ where: { organizationId, title: contains }, orderBy: { updatedAt: "desc" }, take: TAKE })
      : [],
    include.sermons
      ? tenantDb.sermon.findMany({ where: { organizationId, title: contains }, orderBy: { preachedAt: "desc" }, take: TAKE })
      : [],
    include.campaigns
      ? tenantDb.campaign.findMany({ where: { organizationId, name: contains }, orderBy: { startsAt: "desc" }, take: TAKE })
      : [],
    include.reports
      ? tenantDb.savedReport.findMany({ where: { organizationId, name: contains }, orderBy: { updatedAt: "desc" }, take: TAKE })
      : [],
  ]);

  return {
    people: people.map((p) => ({ id: p.id, label: personDisplayName(p), sublabel: p.email ?? p.phone ?? null })),
    groups: groups.map((g) => ({ id: g.id, label: g.name, sublabel: null })),
    events: events.map((e) => ({
      id: e.id,
      label: e.title,
      sublabel: e.startAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    })),
    forms: forms.map((f) => ({ id: f.id, label: f.title, sublabel: null })),
    sermons: sermons.map((s) => ({ id: s.id, label: s.title, sublabel: s.speaker ?? null })),
    campaigns: campaigns.map((c) => ({ id: c.id, label: c.name, sublabel: null })),
    reports: reports.map((r) => ({ id: r.id, label: r.name, sublabel: null })),
  };
}
