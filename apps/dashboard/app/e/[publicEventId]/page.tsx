import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { after } from "next/server";
import { CalendarDays, CheckCircle2, MapPin } from "lucide-react";
import { auditService, eventService, expandOccurrences } from "@cms/database";
import { Card } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";
import { SubmitButton } from "../../../components/SubmitButton";
import { formatEventDate, recurrenceLabel } from "../../../lib/events-format";
import { checkRateLimit, getClientIp } from "../../../lib/rate-limit";
import { drainOutbox } from "../../../lib/outbox-worker";

/**
 * Public, unauthenticated event page + registration. Resolved entirely by the event's
 * publicId (the forms/widget/prayer boundary) -- NOT under the (dashboard) layout, NOT in
 * the middleware matcher. The server action re-resolves the event, validates, rate-limits,
 * and registers through the capacity-guarded service (which emits EventRegistered
 * atomically for workflow triggers).
 */

async function registerAction(publicEventId: string, formData: FormData) {
  "use server";
  const event = await eventService.resolvePublicEvent(publicEventId);
  if (!event) redirect(`/e/${publicEventId}?error=unavailable`);

  const ip = getClientIp(await headers());
  const rate = checkRateLimit(`event-register-ip:${event.organizationId}:${ip ?? "unknown"}`, 20, 60 * 60 * 1000);
  if (!rate.allowed) redirect(`/e/${publicEventId}?error=rate_limited`);

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim() || null;
  if (!firstName || !lastName) redirect(`/e/${publicEventId}?error=invalid`);

  const result = await eventService.register(event, { firstName, lastName, email });
  if (!result.ok) {
    redirect(`/e/${publicEventId}?error=${result.reason === "full" ? "full" : "invalid"}`);
  }

  await auditService.recordAuditEvent({
    organizationId: event.organizationId,
    actorUserId: null,
    action: "event.registration_received",
    targetType: "Event",
    targetId: event.id,
    metadata: { registrationId: result.registrationId, personId: result.personId },
  });

  // Low-latency drain of the EventRegistered event (workflow triggers); cron is the
  // durable backstop.
  after(async () => {
    try {
      await drainOutbox();
    } catch (err) {
      console.error("Opportunistic outbox drain failed (cron will retry):", err);
    }
  });

  redirect(`/e/${publicEventId}?registered=1${result.alreadyRegistered ? "&already=1" : ""}`);
}

const ERROR_MESSAGES: Record<string, string> = {
  unavailable: "This event is no longer available.",
  rate_limited: "Too many registrations from your connection — please try again later.",
  invalid: "Please provide your first and last name.",
  full: "This event is full.",
};

export default async function PublicEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicEventId: string }>;
  searchParams: Promise<{ registered?: string; already?: string; error?: string }>;
}) {
  const { publicEventId } = await params;
  const sp = await searchParams;
  const event = await eventService.resolvePublicEvent(publicEventId);
  if (!event) notFound();

  const now = new Date();
  const upcoming = expandOccurrences(event, now, new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000), 5);
  const isFull = event.capacity !== null && event.registeredCount >= event.capacity;
  const boundRegister = registerAction.bind(null, publicEventId);

  return (
    <div className="min-h-screen bg-surface-muted">
      <main className="mx-auto max-w-xl px-6 py-12">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight text-ink">{event.title}</h1>
        <p className="mb-1 flex items-center gap-1.5 text-sm text-ink-secondary">
          <CalendarDays size={15} className="text-ink-muted" />
          {formatEventDate(event.startAt, event.allDay)}
          {event.recurrence !== "NONE" && (
            <span className="text-ink-muted">· {recurrenceLabel(event.recurrence, event.recurrenceInterval)}</span>
          )}
        </p>
        {event.location && (
          <p className="mb-4 flex items-center gap-1.5 text-sm text-ink-secondary">
            <MapPin size={15} className="text-ink-muted" /> {event.location}
          </p>
        )}
        {event.description && <p className="mb-6 whitespace-pre-wrap text-sm text-ink-secondary">{event.description}</p>}

        {event.recurrence !== "NONE" && upcoming.length > 0 && (
          <Card padding="sm" className="mb-6">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Upcoming dates</h2>
            <ul className="space-y-1 text-sm text-ink-secondary">
              {upcoming.map((occurrence) => (
                <li key={occurrence.toISOString()}>{formatEventDate(occurrence, event.allDay)}</li>
              ))}
            </ul>
          </Card>
        )}

        {sp.registered ? (
          <Card padding="md">
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 size={32} className="text-success" />
              <p className="text-sm font-medium text-ink">
                {sp.already ? "You're already registered — see you there!" : "You're registered — see you there!"}
              </p>
            </div>
          </Card>
        ) : (
          <Card padding="md">
            <h2 className="mb-1 text-sm font-semibold text-ink">Register</h2>
            {event.capacity !== null && (
              <p className="mb-3 text-xs text-ink-muted">
                {Math.max(0, event.capacity - event.registeredCount)} of {event.capacity} spots left
              </p>
            )}
            {sp.error && (
              <p className="mb-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
                {ERROR_MESSAGES[sp.error] ?? "Something went wrong."}
              </p>
            )}
            {isFull ? (
              <p className="py-4 text-center text-sm text-ink-muted">This event is full.</p>
            ) : (
              <form action={boundRegister} className="flex flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm text-ink-secondary">
                    First name <span className="text-danger">*</span>
                    <Input name="firstName" required className="mt-1" />
                  </label>
                  <label className="block text-sm text-ink-secondary">
                    Last name <span className="text-danger">*</span>
                    <Input name="lastName" required className="mt-1" />
                  </label>
                </div>
                <label className="block text-sm text-ink-secondary">
                  Email <span className="text-ink-muted">(so we can send details)</span>
                  <Input name="email" type="email" className="mt-1" />
                </label>
                <div className="flex justify-end">
                  <SubmitButton pendingLabel="Registering…">Register</SubmitButton>
                </div>
              </form>
            )}
          </Card>
        )}
      </main>
    </div>
  );
}
