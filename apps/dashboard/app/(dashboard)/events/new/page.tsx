import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { campusService } from "@cms/database";
import { Card } from "../../../../components/ui/Card";
import { EventForm } from "../../../../components/EventForm";
import { requireEvents } from "../../../../lib/events-access";
import { getCurrentOrganization } from "../../../../lib/session";
import { createEventAction } from "../actions";

export default async function NewEventPage() {
  const organization = await getCurrentOrganization();
  if (!organization) return null;
  await requireEvents(organization.id, "event.manage");

  const campuses = await campusService.listCampuses(organization.id);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/events" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink">
        <ArrowLeft size={15} /> Back to Events
      </Link>
      <h1 className="mb-1 text-display text-[28px] leading-tight text-ink">Create an event</h1>
      <p className="mb-6 text-sm text-ink-secondary">Publish it after saving to get a shareable public page.</p>
      <Card padding="md">
        <EventForm
          action={createEventAction}
          campuses={campuses.map((c) => ({ id: c.id, name: c.name }))}
          submitLabel="Create event"
        />
      </Card>
    </div>
  );
}
