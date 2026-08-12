import { eventService, groupService, nextOccurrence, sermonService, type SiteSection } from "@cms/database";

/**
 * Live data for the website's dynamic sections (docs/domain/website.md).
 * Same already-public content the church app shows — events, sermon library,
 * published groups — fetched once per request for whatever section kinds the
 * page actually uses. No person data ever.
 */

export interface SiteLiveContent {
  events: { id: string; title: string; when: string; location: string | null }[];
  sermons: { id: string; title: string; speaker: string | null; series: string | null; when: string; videoUrl: string | null }[];
  groups: { id: string; name: string; description: string | null }[];
}

export async function buildSiteLiveContent(organizationId: string, sections: SiteSection[]): Promise<SiteLiveContent> {
  const kinds = new Set(sections.map((s) => s.kind));
  const [events, sermons, groups] = await Promise.all([
    kinds.has("events") ? eventService.listEvents(organizationId) : Promise.resolve([]),
    kinds.has("sermons") ? sermonService.listSermons(organizationId, { take: 20 }) : Promise.resolve([]),
    kinds.has("groups") ? groupService.listGroups(organizationId, { publishedOnly: true }) : Promise.resolve([]),
  ]);

  const now = new Date();
  const upcoming = events
    .map((event) => ({ event, next: nextOccurrence(event, now) }))
    .filter((e): e is { event: (typeof events)[number]; next: Date } => e.next !== null)
    .sort((a, b) => a.next.getTime() - b.next.getTime());

  return {
    events: upcoming.map(({ event, next }) => ({
      id: event.id,
      title: event.title,
      when: next.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
      location: event.location ?? null,
    })),
    sermons: sermons.map((sermon) => ({
      id: sermon.id,
      title: sermon.title,
      speaker: sermon.speaker,
      series: sermon.series,
      when: sermon.preachedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      videoUrl: sermon.videoUrl,
    })),
    groups: groups.map((group) => ({ id: group.id, name: group.name, description: group.description ?? null })),
  };
}
