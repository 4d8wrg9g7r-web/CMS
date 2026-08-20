import { parseSermonLinks, appPageService, eventService, formService, groupService, sermonService, organizationService, nextOccurrence, formatDateTimeShort, DEFAULT_TIMEZONE } from "@cms/database";
import type { AppContent } from "../components/church-app/AppScreen";

/**
 * Assemble the church app's content (docs/domain/app.md) — used identically by
 * App Studio's live preview and the public /a/<id> surface, so the preview never
 * lies. Everything here is already-public content: published groups, published
 * forms, the event calendar, and the sermon library. No person data.
 */
export async function buildAppContent(organizationId: string): Promise<AppContent> {
  const timeZone = (await organizationService.getOrganizationTimezone(organizationId)) ?? DEFAULT_TIMEZONE;
  const [events, sermons, groups, forms, pages] = await Promise.all([
    eventService.listEvents(organizationId),
    sermonService.listSermons(organizationId, { take: 20 }),
    groupService.listGroups(organizationId, { publishedOnly: true }),
    formService.listForms(organizationId),
    appPageService.listActivePages(organizationId),
  ]);

  const now = new Date();
  const upcoming = events
    .map((event) => ({ event, next: nextOccurrence(event, now) }))
    .filter((e): e is { event: (typeof events)[number]; next: Date } => e.next !== null)
    .sort((a, b) => a.next.getTime() - b.next.getTime())
    .slice(0, 10);

  return {
    events: upcoming.map(({ event, next }) => ({
      id: event.id,
      title: event.title,
      when: formatDateTimeShort(next, timeZone),
      location: event.location ?? null,
      imageUrl: event.imageUrl ?? null,
      occurrenceAt: next.toISOString(),
      endsAt: new Date(
        next.getTime() +
          (event.endAt ? Math.max(0, event.endAt.getTime() - event.startAt.getTime()) : 2 * 3600 * 1000),
      ).toISOString(),
      allowAppCheckIn: event.allowAppCheckIn,
    })),
    sermons: sermons.map((sermon) => ({
      id: sermon.id,
      title: sermon.title,
      speaker: sermon.speaker,
      series: sermon.series,
      passage: sermon.passage,
      when: sermon.preachedAt.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }),
      videoUrl: sermon.videoUrl,
      videoFileUrl: sermon.videoFileUrl,
      audioUrl: sermon.audioUrl,
      artworkUrl: sermon.artworkUrl,
      links: parseSermonLinks(sermon.links),
    })),
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      description: group.description ?? null,
    })),
    forms: forms
      .filter((form) => form.status === "PUBLISHED")
      .map((form) => ({ id: form.id, title: form.title, href: `/f/${form.publicId}` })),
    pages,
  };
}
