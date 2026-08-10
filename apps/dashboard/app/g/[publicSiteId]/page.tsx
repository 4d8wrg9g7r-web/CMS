import { notFound } from "next/navigation";
import { CalendarClock, MapPin, Users2 } from "lucide-react";
import { groupService, organizationService } from "@cms/database";
import { Card } from "../../../components/ui/Card";
import { groupEnrollmentLabel, groupTypeLabel } from "../../../lib/groups-format";

/**
 * Public group finder (BLUEPRINT §8 "group finder publishing"). Lists PUBLISHED groups
 * only; membership details stay private. Read-only in v1 -- interest capture composes the
 * Forms primitive when a church wants it (documented deferral in docs/domain/groups.md).
 */
export default async function PublicGroupFinderPage({ params }: { params: Promise<{ publicSiteId: string }> }) {
  const { publicSiteId } = await params;
  const site = await organizationService.resolvePublicSite(publicSiteId);
  if (!site) notFound();

  const groups = await groupService.listGroups(site.organizationId, { publishedOnly: true });

  return (
    <div className="min-h-screen bg-surface-muted">
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-ink">{site.name}</h1>
        <p className="mb-8 flex items-center gap-1.5 text-sm text-ink-secondary">
          <Users2 size={15} className="text-ink-muted" /> Find a group
        </p>

        {groups.length === 0 ? (
          <Card padding="md">
            <p className="py-6 text-center text-sm text-ink-muted">No groups are listed right now — check back soon.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <Card key={group.id} padding="sm">
                <div className="mb-1 flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-ink">{group.name}</p>
                  <span className="shrink-0 rounded-full bg-surface-muted px-2.5 py-1 text-xs text-ink-secondary">
                    {groupTypeLabel(group.type)}
                  </span>
                </div>
                {group.description && <p className="mb-2 text-sm text-ink-secondary">{group.description}</p>}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                  {group.meetingSchedule && (
                    <span className="flex items-center gap-1">
                      <CalendarClock size={12} /> {group.meetingSchedule}
                    </span>
                  )}
                  {group.meetingLocation && (
                    <span className="flex items-center gap-1">
                      <MapPin size={12} /> {group.meetingLocation}
                    </span>
                  )}
                  <span>{groupEnrollmentLabel(group.enrollment)}</span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
